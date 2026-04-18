import { ImageRenderer } from "../renderers/ImageRenderer";
import { Mp4Renderer } from "../renderers/Mp4Renderer";

export type WSCallbacks = {
	onOpen?: () => void;
	onClose?: () => void;
	onError?: () => void;
	onMseNotSupported?: () => void;
	onFrame?: () => void; // called when a binary frame is processed
	onReinit?: () => void; // text control message 'reinit'
};

type AnyRenderer = ImageRenderer | Mp4Renderer;

export class OmniWSService {
	private ws: WebSocket | null = null;
	private renderer: AnyRenderer | null = null;
	private container: HTMLElement;
	private callbacks: WSCallbacks;

	constructor(container: HTMLElement, callbacks: WSCallbacks = {}) {
		this.container = container;
		this.callbacks = callbacks;
	}

	connect(url: string) {
		this.disconnect();

		const ws = new WebSocket(url);
		ws.binaryType = "arraybuffer";
		this.ws = ws;

		ws.onopen = () => {
			this.callbacks.onOpen?.();
		};

		ws.onmessage = (event: MessageEvent) => {
			if (typeof event.data === "string") {
				if (event.data === "reinit") {
					this.destroyRenderer();
					this.callbacks.onReinit?.();
				}
				return;
			}

			// Binary frame: create renderer lazily based on magic bytes
			if (!this.renderer) {
				const probe = new Uint8Array(event.data as ArrayBuffer, 0, 12);
				if (probe[0] === 0xff && probe[1] === 0xd8) {
					this.renderer = new ImageRenderer(this.container, "image/jpeg");
				} else if (probe[0] === 0x89 && probe[1] === 0x50) {
					this.renderer = new ImageRenderer(this.container, "image/png");
				} else if (
					probe[0] === 0x52 &&
					probe[1] === 0x49 &&
					probe[2] === 0x46 &&
					probe[3] === 0x46 &&
					probe[8] === 0x57 &&
					probe[9] === 0x45 &&
					probe[10] === 0x42 &&
					probe[11] === 0x50
				) {
					this.renderer = new ImageRenderer(this.container, "image/webp");
				} else if (probe[0] === 0x42 && probe[1] === 0x4d) {
					this.renderer = new ImageRenderer(this.container, "image/bmp");
				} else {
					const mseType = 'video/mp4; codecs="avc1.42E028"';
					if (typeof MediaSource === "undefined" || !MediaSource.isTypeSupported(mseType)) {
						this.callbacks.onMseNotSupported?.();
						this.ws?.close();
						return;
					}
					this.renderer = new Mp4Renderer(this.container);
				}
			}

			this.renderer?.push(event.data as ArrayBuffer);
			this.callbacks.onFrame?.();
		};

		ws.onerror = () => {
			this.callbacks.onError?.();
		};

		ws.onclose = () => {
			this.destroyRenderer();
			this.callbacks.onClose?.();
			this.ws = null;
		};
	}

	send(text: string) {
		try {
			this.ws?.send(text);
		} catch (e) {
			console.error("[WS Service] send error", e);
		}
	}

	disconnect() {
		try {
			this.ws?.close();
		} catch (_) {
			/* ignore */
		}
		this.ws = null;
	}

	destroyRenderer() {
		try {
			this.renderer?.destroy();
		} catch (_) {
			/* ignore */
		}
		this.renderer = null;
	}

	dispose() {
		this.disconnect();
		this.destroyRenderer();
	}
}

export default OmniWSService;
