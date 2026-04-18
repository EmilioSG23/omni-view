/**
 * Renders an H.264 fragmented-MP4 stream via MediaSource Extensions (MSE).
 *
 * The agent sends:
 *   - First chunk: ftyp + empty moov (MSE initialisation segment)
 *   - Each subsequent chunk: moof + mdat (one I-frame per fragment, -g 1)
 *
 * Chunks are queued and appended one at a time because appendBuffer() is
 * asynchronous and must not overlap (would throw InvalidStateError).
 */
export class Mp4Renderer {
	private readonly video: HTMLVideoElement;
	private readonly ms: MediaSource;
	private sb: SourceBuffer | null = null;
	private queue: ArrayBuffer[] = [];
	private appending = false;
	private readonly catchupTimer: ReturnType<typeof setInterval>;

	constructor(container: HTMLElement) {
		this.video = document.createElement("video");
		this.video.dataset.omniScreen = "1";
		this.video.autoplay = true;
		this.video.muted = true;
		this.video.playsInline = true;
		this.video.style.cssText =
			"width:100%;height:100%;display:block;object-fit:contain;background:#000";
		container.prepend(this.video);

		this.ms = new MediaSource();
		this.video.src = URL.createObjectURL(this.ms);
		this.ms.addEventListener("sourceopen", () => this.onSourceOpen());
		this.ms.addEventListener("error", (e) => console.error("[MSE] error", e));

		// On stall: seek to live edge then call play().
		const seekToLiveEdge = () => {
			if (this.sb && this.video.buffered.length > 0) {
				const end = this.video.buffered.end(this.video.buffered.length - 1);
				if (this.video.currentTime < end - 0.3) {
					this.video.currentTime = end - 0.1;
				}
			}
			this.video.play().catch(() => {});
		};
		this.video.addEventListener("canplay", seekToLiveEdge);
		this.video.addEventListener("waiting", seekToLiveEdge);
		this.video.addEventListener("stalled", seekToLiveEdge);

		// Catchup timer: snap forward if playback drifts > 1.5 s behind live edge.
		this.catchupTimer = setInterval(() => {
			if (this.video.paused || !this.sb || this.video.buffered.length === 0) return;
			const end = this.video.buffered.end(this.video.buffered.length - 1);
			if (end - this.video.currentTime > 1.5) {
				this.video.currentTime = end - 0.1;
			}
		}, 1000);
	}

	private onSourceOpen(): void {
		// H.264 Constrained Baseline 4.0 — matches: -profile:v baseline -level:v 4.0
		const mimeType = 'video/mp4; codecs="avc1.42E028"';
		if (!MediaSource.isTypeSupported(mimeType)) {
			console.error("[MSE] codec not supported:", mimeType);
			return;
		}
		this.sb = this.ms.addSourceBuffer(mimeType);
		this.sb.mode = "sequence";
		this.sb.addEventListener("updateend", () => {
			this.appending = false;
			this.flush();
		});
		this.sb.addEventListener("error", (e) => console.error("[MSE] SourceBuffer error", e));
		this.flush();
	}

	push(buffer: ArrayBuffer): void {
		// Drop oldest frames if MSE can't keep up; keep at most 2 pending.
		if (this.queue.length > 2) this.queue = this.queue.slice(-2);
		this.queue.push(buffer);
		this.flush();
	}

	private flush(): void {
		if (this.appending || !this.sb || this.sb.updating || this.queue.length === 0) return;

		// Evict only data already played (behind currentTime).
		if (this.video.buffered.length > 0) {
			const start = this.video.buffered.start(0);
			const evictTo = this.video.currentTime - 0.5;
			if (evictTo > start + 0.3) {
				try {
					this.sb.remove(start, evictTo);
					this.appending = true;
					return;
				} catch (_) {
					/* ignore */
				}
			}
		}

		this.appending = true;
		this.sb.appendBuffer(this.queue.shift()!);
	}

	destroy(): void {
		clearInterval(this.catchupTimer);
		this.queue = [];
		try {
			if (this.ms.readyState === "open") this.ms.endOfStream();
		} catch (_) {
			/* ignore */
		}
		this.video.src = "";
		this.video.remove();
	}
}
