import type { AgentSummary } from "@omni-view/shared";
import { useEffect, useRef, useState } from "react";
import { StatusDot } from "../components/StatusDot";
import { ConnectForm } from "../components/viewer/ConnectForm";
import { ControlButton } from "../components/viewer/ControlButton";
import { QualityBar } from "../components/viewer/QualityBar";
import { WebRTCViewer } from "../components/WebRTCViewer";
import { AgentSession, type SessionState } from "../core/agent-ws";
import { useImageViewer } from "../hooks/viewer/useImageViewer";
import { useMseViewer } from "../hooks/viewer/useMseViewer";
import { useQualityControls } from "../hooks/viewer/useQualityControls";
import { useStreamHealth } from "../hooks/viewer/useStreamHealth";

interface ViewerPageProps {
	agent: AgentSummary;
	/** Pre-filled password for browser-mode agents. */
	password?: string;
	onBack: () => void;
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
	if (agent.capture_mode === "browser") {
		return (
			<div className="flex flex-col h-full overflow-hidden">
				<header className="h-header border-b border-border flex items-center px-5 py-2 gap-4 shrink-0">
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
