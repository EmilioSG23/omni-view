import { useWebRTCViewer } from "@/hooks/viewer/useWebRTCViewer";
import { ExitFullscreenIcon } from "@/icons/ExitFullscreenIcon";
import { FullscreenIcon } from "@/icons/FullscreenIcon";
import { MuteIcon } from "@/icons/MuteIcon";
import { PauseIcon } from "@/icons/PauseIcon";
import { PlayIcon } from "@/icons/PlayIcon";
import { VolumeIcon } from "@/icons/VolumeIcon";
import type { AgentSummary, QualityPreset } from "@omni-view/shared";
import { QualityBar } from "./QualityBar";

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
		muted,
		volume,
		setVolume,
		viewerQuality,
		isFullscreen,
		showControls,
		pendingPassword,
		setPendingPassword,
		connect,
		disconnect,
		togglePause,
		toggleMute,
		setViewerQuality,
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

						{/* Bottom bar — pause+mute on the left, quality+fullscreen on the right */}
						<div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-4 pb-3 pt-10 flex items-end justify-between pointer-events-auto">
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={togglePause}
									title={paused ? "Resume" : "Pause"}
									className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
								>
									{paused ? <PlayIcon /> : <PauseIcon />}
								</button>
								{/* Volume control: a button + slider that appears on hover (desktop) or tap (mobile) */}
								<div className="relative flex items-center">
									<div className="absolute bottom-[50%] left-1/2 mb-3 flex h-28 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-black/55 backdrop-blur-xs sm:hidden">
										<input
											type="range"
											min={0}
											max={100}
											value={Math.round(volume * 100)}
											onChange={(e) => setVolume(Number(e.target.value) / 100)}
											onTouchStart={(e) => e.stopPropagation()}
											onTouchMove={(e) => e.stopPropagation()}
											onTouchEnd={(e) => e.stopPropagation()}
											aria-label="Volume"
											className="w-20 h-1.5 -rotate-90 accent-accent"
										/>
									</div>
									<button
										type="button"
										onClick={toggleMute}
										title={muted ? "Unmute" : "Mute"}
										className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
									>
										{muted ? <MuteIcon /> : <VolumeIcon />}
									</button>
								</div>
								<input
									type="range"
									min={0}
									max={100}
									value={Math.round(volume * 100)}
									onChange={(e) => setVolume(Number(e.target.value) / 100)}
									aria-label="Volume"
									className="hidden sm:block w-28 h-1.5 accent-accent"
								/>
							</div>
							<div className="flex items-center gap-2">
								<QualityBar
									activePreset={viewerQuality}
									onSelect={(p) => setViewerQuality(p as Exclude<QualityPreset, "custom">)}
								/>
								<button
									type="button"
									onClick={toggleFullscreen}
									title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
									className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
								>
									{isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
								</button>
							</div>
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
