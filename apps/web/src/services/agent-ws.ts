import type {
	AgentToClientMessage,
	ClientToAgentMessage,
	QualityConfig,
	QualityPreset,
	SessionEventMap,
	SessionState,
} from "@omni-view/shared";
import { AGENT_MSG, TypedEventEmitter } from "@omni-view/shared";

// ─── Re-export for consumers that only import from this module ────────────────

export type { SessionEventMap as SessionEvents, SessionState };

// ─── AgentSession ─────────────────────────────────────────────────────────────

/**
 * Manages a direct WebSocket connection to a remote OmniView agent.
 *
 * Usage:
 * ```ts
 * const session = new AgentSession("ws://192.168.1.5:9000", "secret");
 * session.on("binaryFrame", (buf) => { ... });
 * session.on("stateChange", (state) => { ... });
 * session.connect();
 * ```
 */
export class AgentSession extends TypedEventEmitter<SessionEventMap> {
	private ws: WebSocket | null = null;
	private state: SessionState = "idle";
	private attempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;

	constructor(
		private readonly wsUrl: string,
		private readonly password: string,
	) {
		super();
	}

	// ─── State ──────────────────────────────────────────────────────────────

	getState(): SessionState {
		return this.state;
	}

	private setState(s: SessionState): void {
		this.state = s;
		this.emit("stateChange", s);
	}

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	connect(): void {
		if (this.stopped) return;
		this.setState("connecting");
		try {
			const ws = new WebSocket(this.wsUrl);
			this.ws = ws;
			ws.binaryType = "arraybuffer";
			ws.onopen = () => {
				this.attempts = 0;
				this.setState("authenticating");
				this.send({ type: "auth", password: this.password });
			};
			ws.onmessage = (ev: MessageEvent) => this.handleMessage(ev);
			ws.onerror = () => this.emit("error", new Error("WebSocket connection error"));
			ws.onclose = () => {
				if (!this.stopped) this.scheduleReconnect();
			};
		} catch (err) {
			this.emit("error", err instanceof Error ? err : new Error(String(err)));
			this.scheduleReconnect();
		}
	}

	close(): void {
		this.stopped = true;
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.ws?.close();
		this.setState("closed");
	}

	// ─── Controls ───────────────────────────────────────────────────────────

	pause(): void {
		this.send({ type: "pause" });
		this.setState("paused");
	}

	resume(): void {
		this.send({ type: "resume" });
		this.setState("streaming");
	}

	setQuality(preset: QualityPreset, custom?: QualityConfig): void {
		this.send({ type: "config", preset, custom });
	}

	// ─── Internals ──────────────────────────────────────────────────────────

	private handleMessage(ev: MessageEvent): void {
		if (ev.data instanceof ArrayBuffer) {
			this.emit("binaryFrame", ev.data);
			return;
		}
		let msg: AgentToClientMessage;
		try {
			msg = JSON.parse(ev.data as string) as AgentToClientMessage;
		} catch {
			return; // non-JSON text frame — ignore
		}
		if (msg.type === AGENT_MSG.AUTH_OK) {
			this.setState("streaming");
		} else if (msg.type === AGENT_MSG.AUTH_ERROR) {
			this.stopped = true;
			this.setState("closed");
			this.ws?.close();
			this.emit("error", new Error("Authentication rejected by agent"));
		}
		this.emit("message", msg);
	}

	private send(msg: ClientToAgentMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	private scheduleReconnect(): void {
		if (this.stopped) return;
		this.attempts++;
		if (this.attempts > 6) {
			this.setState("degraded");
			return;
		}
		const delay = Math.min(500 * 2 ** (this.attempts - 1), 30_000);
		this.reconnectTimer = setTimeout(() => this.connect(), delay);
	}
}
