import type { AgentSummary, QualityPreset } from "@omni-view/shared";
import { QUALITY_PRESETS } from "@omni-view/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusDot } from "../components/StatusDot";
import { WebRTCViewer } from "../components/WebRTCViewer";
import { AgentSession, type SessionState } from "../core/agent-ws";
import { useWhitelistCheck } from "../core/whitelist";

interface ViewerPageProps {
	agent: AgentSummary;
	/** Pre-filled password for browser-mode agents. */
	password?: string;
	onBack: () => void;
}

// ─── Frame type detection ─────────────────────────────────────────────────────

/** True if buffer is an fMP4 frame (ftyp, moov, or moof box). */
function isFmpFrame(buf: ArrayBuffer): boolean {
	if (buf.byteLength < 8) return false;
	const v = new DataView(buf);
	const b4 = v.getUint8(4),
		b5 = v.getUint8(5);
	// "ft" (ftyp) or "mo" (moov / moof)
	return (b4 === 0x66 && b5 === 0x74) || (b4 === 0x6d && b5 === 0x6f);
}

/** True if buffer is a JPEG (SOI = FF D8). */
function isJpeg(buf: ArrayBuffer): boolean {
	if (buf.byteLength < 2) return false;
	const v = new DataView(buf);
	return v.getUint8(0) === 0xff && v.getUint8(1) === 0xd8;
}

/** True if buffer is a PNG (magic 89 50 …). */
function isPng(buf: ArrayBuffer): boolean {
	if (buf.byteLength < 4) return false;
	const v = new DataView(buf);
	return v.getUint8(0) === 0x89 && v.getUint8(1) === 0x50;
}

// ─── H264 / fMP4 viewer via MediaSource ──────────────────────────────────────

function useMseViewer(
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

// ─── Image fallback viewer (JPEG / PNG) ──────────────────────────────────────

function useImageViewer(
	canvasRef: React.RefObject<HTMLCanvasElement | null>,
	session: AgentSession | null,
) {
	useEffect(() => {
		if (!session || !canvasRef.current) return;
		const ctx = canvasRef.current.getContext("2d");
		const off = session.on("binaryFrame", (buf) => {
			if (isFmpFrame(buf)) return; // fMP4 data goes to video
			const blob = new Blob([buf]);
			createImageBitmap(blob)
				.then((bmp) => {
					const canvas = canvasRef.current;
					if (!canvas || !ctx) return;
					canvas.width = bmp.width;
					canvas.height = bmp.height;
					ctx.drawImage(bmp, 0, 0);
					bmp.close();
				})
				.catch(() => {
					/* not a valid image */
				});
		});
		return off;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session]);
}

// ─── Stream health (FPS + last-frame age) ────────────────────────────────────

function useStreamHealth(session: AgentSession | null) {
	const frameTimesRef = useRef<number[]>([]);
	const [fps, setFps] = useState(0);
	const [lastFrameAge, setLastFrameAge] = useState<number | null>(null);

	useEffect(() => {
		if (!session) {
			frameTimesRef.current = [];
			setFps(0);
			setLastFrameAge(null);
			return;
		}
		const offFrame = session.on("binaryFrame", () => {
			const now = Date.now();
			frameTimesRef.current.push(now);
			const cutoff = now - 1000;
			frameTimesRef.current = frameTimesRef.current.filter((t) => t > cutoff);
			setFps(frameTimesRef.current.length);
			setLastFrameAge(0);
		});
		const timer = setInterval(() => {
			const times = frameTimesRef.current;
			if (times.length > 0) setLastFrameAge(Date.now() - times[times.length - 1]);
		}, 200);
		return () => {
			offFrame();
			clearInterval(timer);
		};
	}, [session]);

	return { fps, lastFrameAge };
}

// ─── Quality controls ─────────────────────────────────────────────────────────

function useQualityControls(session: AgentSession | null) {
	const [activePreset, setActivePreset] = useState<QualityPreset | null>(null);

	useEffect(() => {
		if (!session) return;
		const off = session.on("message", (msg) => {
			if (msg.type === "quality_changed") {
				const cfg = msg.config;
				const match = (
					Object.entries(QUALITY_PRESETS) as [
						QualityPreset,
						(typeof QUALITY_PRESETS)[Exclude<QualityPreset, "custom">],
					][]
				).find(([, p]) => p.fps === cfg.fps && p.quality === cfg.quality);
				setActivePreset(match ? match[0] : "custom");
			}
		});
		return off;
	}, [session]);

	const setPreset = useCallback((preset: QualityPreset) => session?.setQuality(preset), [session]);
	return { activePreset, setPreset };
}

// ─── Connect form with whitelist status ──────────────────────────────────────

interface ConnectFormProps {
	agent: AgentSummary;
	onSubmit: (wsUrl: string, password: string) => void;
}

function ConnectForm({ agent, onSubmit }: ConnectFormProps) {
	const [wsUrl, setWsUrl] = useState(agent.ws_url ?? "");
	const [password, setPassword] = useState("");
	const { status, deviceId, error: wlError, request } = useWhitelistCheck(agent.agent_id);
	const [copyLabel, setCopyLabel] = useState("copy");

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!wsUrl.trim()) return;
		onSubmit(wsUrl.trim(), password);
	}

	async function copyDeviceId() {
		try {
			await navigator.clipboard.writeText(deviceId);
			setCopyLabel("copied!");
			setTimeout(() => setCopyLabel("copy"), 2000);
		} catch {
			/* clipboard unavailable */
		}
	}

	const wlBorderClass =
		status === "allowed"
			? "border-success"
			: status === "denied"
				? "border-error"
				: "border-border";

	return (
		<form
			onSubmit={handleSubmit}
			aria-label={`Connect to ${agent.label ?? agent.agent_id}`}
			className="flex flex-col gap-4 w-full max-w-100"
		>
			<h2 className="font-mono text-xs text-secondary tracking-widest uppercase mb-2">
				Connect to <span className="text-accent">{agent.label ?? agent.agent_id}</span>
			</h2>

			{/* Device identity + whitelist status */}
			<div className={`p-3 bg-elevated rounded border ${wlBorderClass} flex flex-col gap-2`}>
				<div className="flex items-center gap-2 flex-wrap">
					<span className="font-mono text-xs text-muted shrink-0">YOUR DEVICE</span>
					<span
						className="font-mono text-xs text-secondary overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0"
						title={deviceId}
					>
						{deviceId.slice(0, 8)}…{deviceId.slice(-4)}
					</span>
					<button
						type="button"
						onClick={copyDeviceId}
						className="text-xs font-mono text-accent px-2 py-px border border-accent-dim bg-accent-dim rounded-sm shrink-0 cursor-pointer"
					>
						{copyLabel}
					</button>
				</div>
				<div className="flex items-center gap-2">
					{status === "checking" && (
						<span className="text-xs text-muted font-mono">checking access…</span>
					)}
					{status === "allowed" && (
						<span className="text-xs text-success font-mono">✓ device authorized</span>
					)}
					{status === "requested" && (
						<span className="text-xs text-accent font-mono">
							⧖ access requested — share your device ID with the agent operator
						</span>
					)}
					{status === "error" && (
						<span className="text-xs text-warn font-mono">
							⚠ {wlError ?? "whitelist unavailable"}
						</span>
					)}
					{status === "denied" && (
						<>
							<span className="text-xs text-error font-mono">✗ not authorized</span>
							<button
								type="button"
								onClick={() => request("Web Client")}
								className="ml-auto text-xs font-mono text-accent px-3 py-0.5 border border-border-strong rounded bg-overlay cursor-pointer"
							>
								request access
							</button>
						</>
					)}
				</div>
			</div>

			<label className="flex flex-col gap-1">
				<span className="text-xs font-mono text-muted tracking-[0.08em] uppercase">
					WebSocket URL
				</span>
				<input
					type="url"
					value={wsUrl}
					onChange={(e) => setWsUrl(e.target.value)}
					placeholder="ws://192.168.1.x:9000"
					required
					aria-required="true"
					className="h-9 px-3 bg-elevated border border-border-strong rounded text-primary font-mono text-sm outline-none w-full focus:border-accent"
				/>
			</label>

			<label className="flex flex-col gap-1">
				<span className="text-xs font-mono text-muted tracking-[0.08em] uppercase">Password</span>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="enter agent password"
					autoComplete="current-password"
					className="h-9 px-3 bg-elevated border border-border-strong rounded text-primary font-mono text-sm outline-none w-full focus:border-accent"
				/>
			</label>

			<button
				type="submit"
				className="h-9 bg-accent text-inverse font-semibold text-sm rounded tracking-[0.04em] cursor-pointer hover:opacity-85 transition-opacity duration-120"
			>
				Connect
			</button>
		</form>
	);
}

// ─── Quality preset bar ───────────────────────────────────────────────────────

const PRESET_LABELS: Partial<Record<QualityPreset, string>> = {
	performance: "PERF",
	balanced: "BAL",
	quality: "HQ",
};

interface QualityBarProps {
	activePreset: QualityPreset | null;
	onSelect: (preset: QualityPreset) => void;
}

function QualityBar({ activePreset, onSelect }: QualityBarProps) {
	const presets = Object.keys(QUALITY_PRESETS) as Exclude<QualityPreset, "custom">[];
	return (
		<div className="flex items-center gap-1" role="group" aria-label="Stream quality">
			<span className="text-xs font-mono text-muted mr-1">QUALITY</span>
			{presets.map((preset) => {
				const active = activePreset === preset;
				return (
					<button
						key={preset}
						onClick={() => onSelect(preset)}
						aria-pressed={active}
						aria-label={`Set quality to ${preset}`}
						className={`h-5.5 px-2 font-mono text-xs tracking-[0.04em] border rounded-sm cursor-pointer transition-all duration-120 ${
							active
								? "border-accent bg-accent-dim text-accent"
								: "border-border bg-transparent text-secondary"
						}`}
					>
						{PRESET_LABELS[preset] ?? preset}
					</button>
				);
			})}
		</div>
	);
}

// ─── Main viewer page ─────────────────────────────────────────────────────────

const STATE_LABEL: Record<SessionState, string> = {
	idle: "IDLE",
	connecting: "CONNECTING…",
	authenticating: "AUTHENTICATING…",
	streaming: "LIVE",
	paused: "PAUSED",
	degraded: "DEGRADED",
	closed: "DISCONNECTED",
};

export function ViewerPage({ agent, password, onBack }: ViewerPageProps) {
	// Browser-captured agents: use WebRTC viewer instead of the MSE/canvas pipeline
	if (agent.capture_mode === "browser") {
		return (
			<div className="flex flex-col h-full overflow-hidden">
				<header className="h-header border-b border-border flex items-center px-5 gap-4 shrink-0">
					<button
						type="button"
						onClick={onBack}
						className="flex items-center gap-2 text-secondary text-xs font-mono px-2 h-7 border border-border rounded cursor-pointer hover:text-primary hover:border-border-strong transition-[color,border-color] duration-120"
					>
						← back
					</button>
					<span className="font-mono font-semibold text-sm text-primary">
						{agent.label ?? agent.agent_id}
					</span>
				</header>
				<div className="flex-1 overflow-hidden p-4">
					<WebRTCViewer agent={agent} password={password} />
				</div>
			</div>
		);
	}

	const [sessionState, setSessionState] = useState<SessionState>("idle");
	const [session, setSession] = useState<AgentSession | null>(null);
	const [hasMse] = useState(() => typeof MediaSource !== "undefined");
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useMseViewer(videoRef, session);
	useImageViewer(canvasRef, session);
	const { fps, lastFrameAge } = useStreamHealth(session);
	const { activePreset, setPreset } = useQualityControls(session);

	function startSession(wsUrl: string, password: string) {
		const s = new AgentSession(wsUrl, password);
		s.on("stateChange", setSessionState);
		setSession(s);
		s.connect();
	}

	function handleDisconnect() {
		session?.close();
		setSession(null);
		setSessionState("idle");
	}

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			session?.close();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session]);

	// Keyboard shortcuts: Space = pause/resume, Escape = back when idle
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			if (e.code === "Space" && session) {
				e.preventDefault();
				if (sessionState === "streaming") session.pause();
				else if (sessionState === "paused") session.resume();
			}
			if (e.code === "Escape" && sessionState === "idle") onBack();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [session, sessionState, onBack]);

	const isConnected = sessionState === "streaming" || sessionState === "paused";
	const showControls = sessionState !== "idle";
	const lagSecs = lastFrameAge != null ? Math.round(lastFrameAge / 1000) : 0;

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Top bar */}
			<header
				role="banner"
				className="h-header border-b border-border flex items-center px-5 gap-4 shrink-0"
			>
				<button
					onClick={onBack}
					aria-label="Back to directory"
					className="flex items-center gap-2 text-secondary text-xs font-mono px-2 h-7 border border-border rounded cursor-pointer hover:text-primary hover:border-border-strong transition-[color,border-color] duration-120"
				>
					← back
				</button>

				<span className="font-mono font-semibold text-sm text-primary">
					{agent.label ?? agent.agent_id}
				</span>

				<span className="flex-1" />

				{/* FPS / lag indicator */}
				{sessionState === "streaming" && (
					<span
						className={`font-mono text-xs ${lagSecs >= 2 ? "text-error" : "text-muted"}`}
						aria-live="off"
					>
						{fps} fps
						{lagSecs >= 1 && <span className="text-warn ml-2">+{lagSecs}s</span>}
					</span>
				)}

				{/* State badge */}
				<div className="flex items-center gap-2">
					<StatusDot state={sessionState} size={7} />
					<span
						className="font-mono text-xs text-secondary tracking-[0.06em]"
						aria-live="polite"
						aria-atomic="true"
					>
						{STATE_LABEL[sessionState]}
					</span>
				</div>
			</header>

			{/* Main stage */}
			<main
				role="main"
				className="flex-1 relative overflow-hidden bg-base flex items-center justify-center"
			>
				{/* Video — fMP4 via MSE */}
				<video
					ref={videoRef}
					autoPlay
					muted
					playsInline
					aria-label="Agent stream"
					className={`absolute inset-0 w-full h-full object-contain ${hasMse && isConnected ? "block" : "hidden"}`}
				/>

				{/* Canvas — JPEG/PNG; transparent until first image drawn */}
				<canvas
					ref={canvasRef}
					aria-label="Agent stream"
					className={`absolute inset-0 w-full h-full pointer-events-none ${isConnected ? "block" : "hidden"}`}
				/>

				{/* Idle — connect form */}
				{sessionState === "idle" && (
					<div className="absolute inset-0 flex items-center justify-center p-6 z-5>">
						<div className="bg-surface border border-border rounded-xl p-8 w-full max-w-110 shadow-lg">
							<ConnectForm agent={agent} onSubmit={startSession} />
						</div>
					</div>
				)}

				{/* Connecting / authenticating — spinner */}
				{(sessionState === "connecting" || sessionState === "authenticating") && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-5>">
						<div
							className="w-8 h-8 rounded-full border-2 border-border-strong border-t-accent animate-spin"
							role="status"
							aria-label={STATE_LABEL[sessionState]}
						/>
						<span className="font-mono text-xs text-secondary">{STATE_LABEL[sessionState]}</span>
					</div>
				)}

				{/* Paused badge */}
				{sessionState === "paused" && (
					<div
						role="status"
						className="absolute top-4 right-4 px-3 py-1 bg-overlay border border-border-strong rounded font-mono text-xs text-accent tracking-[0.08em] z-10"
					>
						PAUSED
					</div>
				)}

				{/* Degraded overlay */}
				{sessionState === "degraded" && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-5>">
						<span className="text-lg text-error">⚠</span>
						<span className="font-mono text-sm text-error">Connection degraded</span>
						<ControlButton onClick={handleDisconnect}>← reconnect manually</ControlButton>
					</div>
				)}

				{/* Closed overlay */}
				{sessionState === "closed" && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-5>">
						<span className="font-mono text-sm text-secondary">Disconnected</span>
						<ControlButton onClick={handleDisconnect}>reconnect</ControlButton>
					</div>
				)}
			</main>

			{/* Bottom controls bar */}
			{showControls && (
				<footer
					role="toolbar"
					aria-label="Stream controls"
					className="h-bar border-t border-border flex items-center px-5 gap-4 shrink-0 bg-surface"
				>
					{sessionState === "streaming" && (
						<ControlButton onClick={() => session?.pause()} aria-label="Pause (Space)">
							❚❚ pause
						</ControlButton>
					)}
					{sessionState === "paused" && (
						<ControlButton onClick={() => session?.resume()} aria-label="Resume (Space)">
							▶ resume
						</ControlButton>
					)}

					<span className="flex-1" />

					{isConnected && <QualityBar activePreset={activePreset} onSelect={setPreset} />}

					<ControlButton
						onClick={handleDisconnect}
						aria-label="Disconnect"
						className="text-error border-error-dim"
					>
						✕ disconnect
					</ControlButton>
				</footer>
			)}
		</div>
	);
}

// ─── Small helpers ────────────────────────────────────────────────────────────

interface ControlButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children: React.ReactNode;
}

function ControlButton({ children, className, ...rest }: ControlButtonProps) {
	return (
		<button
			{...rest}
			className={`h-7 px-3 font-mono text-xs text-secondary border border-border rounded bg-transparent cursor-pointer transition-opacity duration-120 hover:opacity-75 ${className ?? ""}`.trim()}
		>
			{children}
		</button>
	);
}
