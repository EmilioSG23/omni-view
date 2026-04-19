import { Injectable, OnModuleDestroy } from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";
import WebSocket from "ws";
import logger from "../common/custom-logger.service";
import { FramesService } from "../frames/frames.service";
import { WsGateway } from "../ws/ws.gateway";

const CONTEXT = "AgentClient";

export interface AgentSession {
	agentId: string;
	ws: WebSocket;
	seq: number;
	connected: boolean;
	persist?: boolean;
}

@Injectable()
export class AgentClientService implements OnModuleDestroy {
	private readonly sessions = new Map<string, AgentSession>();
	private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private isDestroying = false;
	private readonly frameStorePath: string;

	constructor(
		private readonly framesService: FramesService,
		private readonly wsGateway: WsGateway,
	) {
		this.frameStorePath =
			process.env.FRAME_STORE_PATH ?? path.join("E:", "databases", "sqlite", "frames");
	}

	/**
	 * Open a backend-pull WebSocket connection to a running agent.
	 * Reconnects automatically with exponential backoff on failure.
	 */
	connect(agentId: string, wsUrl: string, password: string, persist = false): void {
		if (this.sessions.has(agentId)) {
			logger.warn(
				`Already connected to agent ${agentId} — ignoring duplicate connect call`,
				CONTEXT,
			);
			return;
		}
		logger.info(`Connecting to agent ${agentId} at ${wsUrl}`, CONTEXT);
		this.openConnection(agentId, wsUrl, password, 0, persist);
	}

	disconnect(agentId: string): void {
		const session = this.sessions.get(agentId);
		if (!session) return;
		session.ws.close(1000, "backend disconnect");
		this.sessions.delete(agentId);
		logger.info(`Disconnected from agent ${agentId}`, CONTEXT);
	}

	isConnected(agentId: string): boolean {
		return this.sessions.get(agentId)?.connected ?? false;
	}

	async onModuleDestroy(): Promise<void> {
		this.isDestroying = true;

		// Cancel all pending reconnect timers (covers sessions that already left the map)
		for (const timer of this.reconnectTimers.values()) {
			clearTimeout(timer);
		}
		this.reconnectTimers.clear();

		// Gracefully close all active sessions and wait for the WS close events to fire
		// before returning. This ensures app.close() fully drains WebSocket traffic so
		// no logging happens after Jest (or any test runner) has torn down.
		const drainPromises: Promise<void>[] = [];
		for (const [id, session] of this.sessions) {
			drainPromises.push(
				new Promise<void>((resolve) => {
					if (session.ws.readyState === WebSocket.CLOSED) {
						resolve();
						return;
					}
					const t = setTimeout(() => {
						session.ws.terminate();
						resolve();
					}, 2000);
					session.ws.once("close", () => {
						clearTimeout(t);
						resolve();
					});
					if (session.ws.readyState === WebSocket.OPEN) {
						session.ws.close(1000, "backend disconnect");
					}
				}),
			);
			this.sessions.delete(id);
			logger.info(`Disconnected from agent ${id}`, CONTEXT);
		}

		await Promise.all(drainPromises);
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	private openConnection(
		agentId: string,
		wsUrl: string,
		password: string,
		attempt: number,
		persist = false,
	): void {
		const ws = new WebSocket(wsUrl);
		const session: AgentSession = { agentId, ws, seq: 0, connected: false, persist };
		this.sessions.set(agentId, session);

		ws.on("open", () => {
			ws.send(JSON.stringify({ type: "auth", password }));
		});

		ws.on("message", (data: WebSocket.RawData) => {
			this.handleMessage(session, data);
		});

		ws.on("close", (code, reason) => {
			session.connected = false;
			this.sessions.delete(agentId);
			this.wsGateway.notifyAgentSubscribers(agentId, { type: "agent_offline", agentId });
			// Code 1000 = intentional close via disconnect() — do not reconnect
			// isDestroying = module teardown in progress — do not reconnect
			if (code === 1000 || this.isDestroying) {
				logger.info(`Connection to agent ${agentId} closed cleanly — no reconnect`, CONTEXT);
				return;
			}
			logger.warn(
				`Connection to agent ${agentId} closed (code=${code} reason=${reason}) — scheduling reconnect`,
				CONTEXT,
			);
			// Exponential backoff: max 30 s
			const delay = Math.min(500 * 2 ** attempt, 30_000);
			const timer = setTimeout(() => {
				this.reconnectTimers.delete(agentId);
				this.openConnection(agentId, wsUrl, password, attempt + 1, persist);
			}, delay);
			this.reconnectTimers.set(agentId, timer);
		});

		ws.on("error", (err) => {
			logger.error(`WS error for agent ${agentId}: ${err.message}`, undefined, CONTEXT);
		});
	}

	private handleMessage(session: AgentSession, data: WebSocket.RawData): void {
		// Text messages (JSON control/auth)
		if (typeof data === "string" || (data instanceof Buffer && isUtf8Json(data))) {
			const text = data.toString("utf8");
			try {
				const msg = JSON.parse(text) as Record<string, unknown>;
				this.handleControl(session, msg);
			} catch {
				logger.warn(`Unparseable message from agent ${session.agentId}`, CONTEXT);
			}
			return;
		}

		// Binary: raw frame
		if (!session.connected) return; // drop frames before auth completes
		this.saveFrame(session, data as Buffer).catch((err) => {
			logger.error(`Failed to save frame for agent ${session.agentId}: ${err}`, undefined, CONTEXT);
		});
	}

	private handleControl(session: AgentSession, msg: Record<string, unknown>): void {
		switch (msg["type"]) {
			case "auth_ok":
				session.connected = true;
				logger.info(`Authenticated with agent ${session.agentId}`, CONTEXT);
				this.wsGateway.notifyAgentSubscribers(session.agentId, {
					type: "agent_online",
					agentId: session.agentId,
				});
				break;
			case "auth_error":
				logger.error(
					`Auth rejected by agent ${session.agentId}: ${msg["reason"]}`,
					undefined,
					CONTEXT,
				);
				session.ws.close(1008, "auth_error");
				this.sessions.delete(session.agentId);
				break;
			case "reinit":
				logger.info(`Encoder reinit on agent ${session.agentId}`, CONTEXT);
				this.wsGateway.notifyAgentSubscribers(session.agentId, {
					type: "agent_reinit",
					agentId: session.agentId,
				});
				break;
			default:
				break;
		}
	}

	private async saveFrame(session: AgentSession, buffer: Buffer): Promise<void> {
		// Persistence is opt-in: either enabled globally via env or per-session via `persist` flag
		const globalPersist = (process.env.PERSIST_FRAMES ?? "false").toLowerCase() === "true";
		if (!globalPersist && !session.persist) {
			// Not persisting: increment seq for monotonicity and drop the frame
			session.seq++;
			return;
		}
		const now = new Date();
		const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
		const dir = path.join(this.frameStorePath, session.agentId, day);
		await fs.mkdir(dir, { recursive: true });

		const ts = now.toISOString().replace(/[:.]/g, "-");
		const filename = `${ts}_${session.seq.toString().padStart(6, "0")}.jpg`;
		const fullPath = path.join(dir, filename);

		await fs.writeFile(fullPath, buffer);
		await this.framesService.save({
			agent_id: session.agentId,
			path: fullPath,
			content_type: "image/jpeg",
			seq: session.seq,
		});

		session.seq++;
	}
}

/** Quick heuristic: check if Buffer starts with `{` — used to distinguish JSON control messages from binary frames */
function isUtf8Json(buf: Buffer): boolean {
	const first = buf.subarray(0, 1).toString();
	return first === "{" || first === "[";
}
