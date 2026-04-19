import type { AgentSummary } from "@omni-view/shared";
import { ExitFullscreenIcon } from "@/icons/ExitFullscreenIcon";
import { FullscreenIcon } from "@/icons/FullscreenIcon";
import { PauseIcon } from "@/icons/PauseIcon";
import { PlayIcon } from "@/icons/PlayIcon";
import { useWebRTCViewer } from "@/hooks/useWebRTCViewer";


interface WebRTCViewerProps {
	agent: AgentSummary;
	/** Pre-filled password (from the ConnectToAgentForm flow). */
	password?: string;
}

export function WebRTCViewer({ agent, password: initialPassword }: WebRTCViewerProps) {
	const {
		containerRef,
		videoRef,
		connectionState,
		error,
		paused,
		isFullscreen,
		showControls,
		pendingPassword,
		setPendingPassword,
		connect,
		disconnect,
		togglePause,
		toggleFullscreen,
		handleMouseEnter,
		handleMouseLeave,
		handleMouseMove,
		handleTouchEnd,
		isActive,
		isConnecting,
		isPending,
	} = useWebRTCViewer(agent, initialPassword);

	return (
		<div
			ref={containerRef}
			className="flex flex-col h-full w-full bg-base rounded-xl overflow-hidden border border-border"
		>
			{/* Video stage */}
			<div
				className="relative flex-1 bg-black flex items-center justify-center min-h-0"
				onMouseEnter={isActive ? handleMouseEnter : undefined}
				onMouseLeave={isActive ? handleMouseLeave : undefined}
				onMouseMove={isActive ? handleMouseMove : undefined}
				onTouchEnd={isActive ? handleTouchEnd : undefined}
			>
				<video
					ref={videoRef}
					autoPlay
					playsInline
					muted
					className={`w-full h-full object-contain transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`}
				/>

				{/* Overlay states */}
				{!isActive && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
						{isConnecting && (
							<>
								<div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
								<p className="text-sm">Connecting to agent…</p>
							</>
						)}
						{isPending && (
							<>
								<div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
								<p className="text-sm">Waiting for host approval…</p>
							</>
						)}
						{connectionState === "idle" && (
							<form
								className="flex flex-col items-center gap-4 w-full max-w-xs px-4"
								onSubmit={(e) => {
									e.preventDefault();
									void connect(pendingPassword);
								}}
							>
								<p className="text-sm text-muted">Enter the agent password to connect</p>
								<input
									type="password"
									value={pendingPassword}
									onChange={(e) => setPendingPassword(e.target.value)}
									placeholder="Session password…"
									autoFocus
									className="w-full px-3 py-2 rounded-lg bg-elevated border border-border focus:border-accent focus:outline-none text-sm font-mono text-primary placeholder:text-muted"
								/>
								<button
									type="submit"
									disabled={!pendingPassword}
									className="w-full py-2 rounded-lg bg-accent text-inverse font-semibold text-sm transition-opacity disabled:opacity-40 cursor-pointer"
								>
									Connect
								</button>
							</form>
						)}
						{(connectionState === "disconnected" || connectionState === "rejected") && (
							<>
								<p className="text-sm text-error">{error ?? "Disconnected."}</p>
								{connectionState === "disconnected" && (
									<button
										type="button"
										onClick={() => void connect(pendingPassword)}
										className="px-4 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold"
									>
										Reconnect
									</button>
								)}
							</>
						)}
					</div>
				)}

				{/* Controls overlay — appears on hover (desktop) or tap (mobile) */}
				{isActive && (
					<div
						className={`absolute inset-0 transition-opacity duration-200 pointer-events-none ${
							showControls ? "opacity-100" : "opacity-0"
						}`}
					>
						{/* Top bar — name + info on the left, disconnect on the right */}
						<div className="absolute inset-x-0 top-0 bg-linear-to-b from-black/70 to-transparent px-4 pt-3 pb-10 flex items-start justify-between gap-3 pointer-events-auto">
							<div className="min-w-0">
								<p className="text-sm font-semibold text-white leading-tight truncate">
									{agent.label ?? agent.agent_id}
								</p>
								<p className="text-xs text-white/55 font-mono truncate mt-0.5">{agent.agent_id}</p>
							</div>
							<button
								type="button"
								onClick={disconnect}
								className="shrink-0 px-3 py-1.5 rounded-full bg-error/80 hover:bg-error text-white text-xs font-semibold transition-colors"
							>
								Disconnect
							</button>
						</div>

						{/* Bottom bar — pause on the left, fullscreen on the right */}
						<div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-4 pb-3 pt-10 flex items-end justify-between pointer-events-auto">
							<button
								type="button"
								onClick={togglePause}
								title={paused ? "Resume" : "Pause"}
								className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
							>
								{paused ? (
									<PlayIcon />
								) : (
									<PauseIcon />
								)}
							</button>
							<button
								type="button"
								onClick={toggleFullscreen}
								title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
								className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
							>
								{isFullscreen ? (
									<ExitFullscreenIcon />
								) : (
									<FullscreenIcon />
								)}
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Footer — agent label + status (only when not streaming) */}
			{!isActive && (
				<div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-surface">
					<span className="w-2 h-2 rounded-full shrink-0 bg-muted" />
					<span className="text-xs text-muted font-mono truncate">
						{agent.label ?? agent.agent_id}
					</span>
				</div>
			)}
		</div>
	);
}
