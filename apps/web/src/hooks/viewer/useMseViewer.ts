// ─── H264 / fMP4 viewer via MediaSource ──────────────────────────────────────

import { useEffect, useRef } from "react";
import { AgentSession } from "../../services/agent-ws";
import { isJpeg, isPng } from "../../utils/identify-format";

export function useMseViewer(
	videoRef: React.RefObject<HTMLVideoElement | null>,
	session: AgentSession | null,
) {
	const msRef = useRef<MediaSource | null>(null);
	const sbRef = useRef<SourceBuffer | null>(null);
	const queue = useRef<ArrayBuffer[]>([]);
	const ready = useRef(false);
	const blobUrlRef = useRef<string | null>(null);

	function flushQueue() {
		const sb = sbRef.current;
		if (!sb || sb.updating || queue.current.length === 0) return;
		// Evict content older than 30 s to avoid QuotaExceededError
		try {
			if (sb.buffered.length > 0) {
				const start = sb.buffered.start(0);
				const end = sb.buffered.end(sb.buffered.length - 1);
				if (end - start > 30) {
					sb.remove(start, end - 30);
					return;
				}
			}
		} catch {
			/* ignore — SourceBuffer may be detached */
		}
		const buf = queue.current.shift()!;
		try {
			sb.appendBuffer(buf);
		} catch {
			/* ignore stale buffer */
		}
	}

	function setupMse(video: HTMLVideoElement) {
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
			blobUrlRef.current = null;
		}
		ready.current = false;
		sbRef.current = null;
		queue.current = [];
		const ms = new MediaSource();
		msRef.current = ms;
		const url = URL.createObjectURL(ms);
		blobUrlRef.current = url;
		video.src = url;
		ms.addEventListener("sourceopen", () => {
			try {
				const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.42E01F"');
				sbRef.current = sb;
				ready.current = true;
				sb.addEventListener("updateend", flushQueue);
			} catch (e) {
				console.error("[MSE] addSourceBuffer failed:", e);
			}
		});
	}

	function appendFrame(buf: ArrayBuffer) {
		if (isJpeg(buf) || isPng(buf)) return; // image frames go to canvas
		if (!ready.current) {
			queue.current.push(buf);
			return;
		}
		const sb = sbRef.current;
		if (!sb) return;
		queue.current.push(buf);
		if (!sb.updating) flushQueue();
	}

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !session) return;
		if (typeof MediaSource === "undefined") return;
		setupMse(video);
		const offFrame = session.on("binaryFrame", appendFrame);
		// Reinit: agent restarted the stream — next binary frame is a new init segment
		const offMsg = session.on("message", (msg) => {
			if (msg.type === "reinit") {
				const ms = msRef.current;
				if (ms && ms.readyState === "open") {
					try {
						ms.endOfStream();
					} catch {
						/**/
					}
				}
				const v = videoRef.current;
				if (v) setupMse(v);
			}
		});
		return () => {
			offFrame();
			offMsg();
			const ms = msRef.current;
			if (ms && ms.readyState === "open") {
				try {
					ms.endOfStream();
				} catch {
					/**/
				}
			}
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session]);
}
