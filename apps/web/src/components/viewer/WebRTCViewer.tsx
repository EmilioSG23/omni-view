import { useWebRTCViewer } from "@/hooks/viewer/useWebRTCViewer";
import { CameraIcon } from "@/icons/CameraIcon";
import { ExitFullscreenIcon } from "@/icons/ExitFullscreenIcon";
import { FullscreenIcon } from "@/icons/FullscreenIcon";
import { KeyboardIcon } from "@/icons/KeyboardIcon";
import { MouseIcon } from "@/icons/MouseIcon";
import { MuteIcon } from "@/icons/MuteIcon";
import { PauseIcon } from "@/icons/PauseIcon";
import { PlayIcon } from "@/icons/PlayIcon";
import { VolumeIcon } from "@/icons/VolumeIcon";
import type { AgentSummary, QualityPreset } from "@omni-view/shared";
import { useCallback, useEffect, useRef, useState } from "react";
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
		remoteInputPermissions,
		inputPermissionsSynced,
		connect,
		disconnect,
		sendRemoteInputEvent,
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
	const pointerFrameRef = useRef<number | null>(null);
	const [viewerMode, setViewerMode] = useState<"player" | "control">("player");
	const panelRef = useRef<HTMLDivElement>(null);
	const [panelPos, setPanelPos] = useState({ x: 16, y: 12 });
	const [panelCollapsed, setPanelCollapsed] = useState(false);
	const dragOffsetRef = useRef({ x: 0, y: 0 });
	type LocalFeature = "keyboard" | "mouse" | "audio" | "video";
	const [localControls, setLocalControls] = useState({
		keyboard: true,
		mouse: true,
		audio: true,
		video: true,
	});

	const keyboardReady = isActive && inputPermissionsSynced && remoteInputPermissions.keyboard;
	const mouseReady = isActive && inputPermissionsSynced && remoteInputPermissions.mouse;

	const keyboardControlEnabled =
		viewerMode === "control" && keyboardReady && localControls.keyboard;
	const mouseControlEnabled = viewerMode === "control" && mouseReady && localControls.mouse;
	const audioControlEnabled =
		isActive && inputPermissionsSynced && remoteInputPermissions.audio && localControls.audio;
	const videoControlEnabled =
		isActive && inputPermissionsSynced && remoteInputPermissions.video && localControls.video;

	function normalizePointerPosition(clientX: number, clientY: number) {
		const surface = videoRef.current ?? containerRef.current;
		if (!surface) return null;
		const rect = surface.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;
		const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
		return { x, y };
	}

	function handleRemoteMouseMove(event: React.MouseEvent<HTMLDivElement>) {
		const surface = videoRef.current ?? containerRef.current;
		if (surface) {
			const rect = surface.getBoundingClientRect();
			const y = event.clientY - rect.top;
			const nearTopEdge = y <= 88;
			const nearBottomEdge = rect.height - y <= 116;
			if (nearTopEdge || nearBottomEdge) {
				handleMouseMove();
			}
		}
		if (!mouseControlEnabled) return;
		const position = normalizePointerPosition(event.clientX, event.clientY);
		if (!position) return;
		if (pointerFrameRef.current != null) cancelAnimationFrame(pointerFrameRef.current);
		pointerFrameRef.current = requestAnimationFrame(() => {
			sendRemoteInputEvent({ type: "mousemove", ...position });
			pointerFrameRef.current = null;
		});
	}

	const handlePanelDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const container = containerRef.current;
			const panel = panelRef.current;
			if (!container || !panel) return;
			const panelRect = panel.getBoundingClientRect();
			dragOffsetRef.current = {
				x: e.clientX - panelRect.left,
				y: e.clientY - panelRect.top,
			};
			function onMove(ev: MouseEvent) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const containerRect = container!.getBoundingClientRect();
				const currentPanel = panelRef.current;
				if (!currentPanel) return;
				const pRect = currentPanel.getBoundingClientRect();
				const x = Math.max(
					0,
					Math.min(
						containerRect.width - pRect.width,
						ev.clientX - containerRect.left - dragOffsetRef.current.x,
					),
				);
				const y = Math.max(
					0,
					Math.min(
						containerRect.height - pRect.height,
						ev.clientY - containerRect.top - dragOffsetRef.current.y,
					),
				);
				setPanelPos({ x, y });
			}
			function onUp() {
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
			}
			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp);
		},
		[containerRef],
	);

	function handleRemoteMouseButton(
		event: React.MouseEvent<HTMLDivElement>,
		type: "mousedown" | "mouseup",
	) {
		if (!mouseControlEnabled) return;
		if ((event.target as HTMLElement).closest("[data-viewer-overlay-control]")) return;
		const position = normalizePointerPosition(event.clientX, event.clientY);
		if (!position) return;
		containerRef.current?.focus();
		sendRemoteInputEvent({ type, button: event.button, ...position });
	}

	function handleRemoteWheel(event: React.WheelEvent<HTMLDivElement>) {
		if (!mouseControlEnabled) return;
		event.preventDefault();
		sendRemoteInputEvent({ type: "wheel", deltaX: event.deltaX, deltaY: event.deltaY });
	}

	function handleRemoteKey(event: React.KeyboardEvent<HTMLDivElement>, type: "keydown" | "keyup") {
		if (type === "keydown" && event.key === "Escape") {
			setViewerMode("player");
			return;
		}
		if (!keyboardControlEnabled) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest("input, textarea, button, select, [contenteditable='true']")) return;
		event.preventDefault();
		sendRemoteInputEvent({
			type,
			code: event.code,
			key: event.key,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
		});
	}

	function toggleLocalFeature(feature: LocalFeature) {
		setLocalControls((current) => ({
			...current,
			[feature]: !current[feature],
		}));
	}

	const remoteFeatures = [
		{
			key: "keyboard",
			label: localControls.keyboard ? "Keyboard armed" : "Keyboard paused",
			hostEnabled: remoteInputPermissions.keyboard,
			localEnabled: localControls.keyboard,
			icon: KeyboardIcon,
			interactive: true,
		},
		{
			key: "mouse",
			label: localControls.mouse ? "Mouse armed" : "Mouse paused",
			hostEnabled: remoteInputPermissions.mouse,
			localEnabled: localControls.mouse,
			icon: MouseIcon,
			interactive: true,
		},
		{
			key: "audio",
			label: localControls.audio ? "Audio live" : "Audio blocked",
			hostEnabled: remoteInputPermissions.audio,
			localEnabled: localControls.audio,
			icon: VolumeIcon,
			interactive: true,
		},
		{
			key: "video",
			label: localControls.video ? "Video live" : "Video blocked",
			hostEnabled: remoteInputPermissions.video,
			localEnabled: localControls.video,
			icon: CameraIcon,
			interactive: true,
		},
	];

	const hostAllowedFeatures = inputPermissionsSynced
		? remoteFeatures.filter((feature) => feature.hostEnabled)
		: [];
	const hasHostInputPermissions = hostAllowedFeatures.some(
		(feature) => feature.key === "keyboard" || feature.key === "mouse",
	);

	useEffect(() => {
		if (viewerMode === "control" && !hasHostInputPermissions) {
			setViewerMode("player");
		}
	}, [hasHostInputPermissions, viewerMode]);

	useEffect(() => {
		if (viewerMode === "control") {
			setPanelCollapsed(false);
		}
	}, [viewerMode]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (!audioControlEnabled) {
			video.muted = true;
			return;
		}
		video.muted = muted;
		video.volume = volume;
	}, [audioControlEnabled, muted, volume, videoRef]);

	return (
		<div
			ref={containerRef}
			tabIndex={isActive ? 0 : -1}
			onKeyDown={
				isActive && viewerMode === "control"
					? (event) => handleRemoteKey(event, "keydown")
					: undefined
			}
			onKeyUp={
				isActive && viewerMode === "control"
					? (event) => handleRemoteKey(event, "keyup")
					: undefined
			}
			className={`flex flex-col h-full w-full rounded-xl overflow-hidden
				${!isFullscreen ? "bg-base border border-border" : ""}`}
		>
			{/* Video stage */}
			<div
				className={`relative flex-1 ${isActive ? "bg-black" : "bg-base"} flex items-center justify-center min-h-0 ${
					mouseControlEnabled ? "cursor-crosshair" : "cursor-default"
				}`}
				onMouseEnter={isActive ? handleMouseEnter : undefined}
				onMouseLeave={isActive ? handleMouseLeave : undefined}
				onMouseMove={
					isActive
						? viewerMode === "control"
							? handleRemoteMouseMove
							: handleMouseMove
						: undefined
				}
				onMouseDown={
					isActive && viewerMode === "control"
						? (event) => handleRemoteMouseButton(event, "mousedown")
						: undefined
				}
				onMouseUp={
					isActive && viewerMode === "control"
						? (event) => handleRemoteMouseButton(event, "mouseup")
						: undefined
				}
				onWheel={isActive && viewerMode === "control" ? handleRemoteWheel : undefined}
				onClick={
					isActive
						? (event) => {
								const target = event.target as HTMLElement;
								if (target.closest("[data-viewer-overlay-control]")) return;
								containerRef.current?.focus();
							}
						: undefined
				}
				onTouchEnd={isActive ? handleTouchEnd : undefined}
			>
				<video
					ref={videoRef}
					autoPlay
					playsInline
					className={`w-full h-full object-contain transition-opacity ${
						isActive && videoControlEnabled ? "opacity-100" : "opacity-0"
					}`}
				/>
				{isActive && !videoControlEnabled && (
					<div className="absolute inset-0 flex items-center justify-center bg-black/95">
						<p className="rounded-full border border-white/20 bg-black/45 px-4 py-1.5 text-xs tracking-[0.12em] uppercase text-white/70">
							Video hidden
						</p>
					</div>
				)}

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

				{/* Controls overlay — hover-reveal (desktop) / tap-toggle (mobile) */}
				{isActive && (
					<div
						className={`absolute inset-0 transition-opacity duration-200 pointer-events-none ${
							showControls ? "opacity-100" : "opacity-0"
						}`}
					>
						{/* ── PLAYER MODE: classic gradient top + bottom bars ── */}
						{viewerMode === "player" && (
							<>
								{/* Top gradient bar */}
								<div
									data-viewer-overlay-control
									className="absolute inset-x-0 top-0 bg-linear-to-b from-black/70 to-transparent px-4 pt-3 pb-10 flex items-start justify-between gap-3 pointer-events-auto"
								>
									<div className="min-w-0 space-y-1.5">
										<p className="text-sm font-semibold text-white leading-tight truncate">
											{agent.label ?? agent.agent_id}
										</p>
										<p className="text-xs text-white/55 font-mono truncate">{agent.agent_id}</p>
										<div className="flex items-center gap-2 pt-0.5">
											<label
												htmlFor="viewer-mode"
												className="text-[11px] uppercase tracking-[0.14em] text-white/60"
											>
												Mode
											</label>
											<select
												data-viewer-overlay-control
												id="viewer-mode"
												value={viewerMode}
												onChange={(ev) => setViewerMode(ev.target.value as "player" | "control")}
												onMouseDown={(e) => e.stopPropagation()}
												className="rounded-lg border border-white/20 bg-black/45 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white focus:border-accent focus:outline-none"
											>
												<option value="player">Player</option>
												<option value="control" disabled={!hasHostInputPermissions}>
													Control
												</option>
											</select>
											<span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest bg-white/10 text-white/70">
												Playback
											</span>
										</div>
										<div className="flex flex-wrap gap-2">
											{hostAllowedFeatures.map((feature) => {
												const Icon = feature.icon;
												const active = feature.hostEnabled && feature.localEnabled;
												return (
													<button
														key={feature.key}
														type="button"
														onClick={() => toggleLocalFeature(feature.key as LocalFeature)}
														title={feature.label}
														className={[
															"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
															active
																? "border-accent/60 bg-accent/20 text-white"
																: "border-white/15 bg-black/35 text-white/55",
														].join(" ")}
													>
														<Icon className="w-3.5 h-3.5" />
														<span className="hidden sm:block">{feature.key}</span>
													</button>
												);
											})}
										</div>
									</div>
									<button
										type="button"
										onClick={disconnect}
										className="shrink-0 px-3 py-1.5 rounded-full bg-error/80 hover:bg-error text-white text-xs font-semibold transition-colors"
									>
										Disconnect
									</button>
								</div>
								{/* Bottom gradient bar */}
								<div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-4 pb-3 pt-10 flex items-end justify-between pointer-events-auto">
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={togglePause}
											title={paused ? "Resume" : "Pause"}
											className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
										>
											{paused ? <PlayIcon /> : <PauseIcon />}
										</button>
										{audioControlEnabled && (
											<>
												<button
													type="button"
													onClick={toggleMute}
													title={muted ? "Unmute" : "Mute"}
													className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
												>
													{muted ? <MuteIcon /> : <VolumeIcon />}
												</button>
												<input
													type="range"
													min={0}
													max={100}
													value={Math.round(volume * 100)}
													onChange={(e) => setVolume(Number(e.target.value) / 100)}
													aria-label="Volume"
													className="max-w-16 md:max-w-28 h-1.5 accent-accent cursor-pointer"
												/>
											</>
										)}
										<span className="ml-2 hidden md:inline text-[11px] uppercase tracking-[0.16em] text-white/45">
											{audioControlEnabled || videoControlEnabled
												? "Playback mode"
												: "Media hidden"}
										</span>
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
							</>
						)}

						{/* ── CONTROL MODE: draggable floating panel + compact bottom bar ── */}
						{viewerMode === "control" && (
							<>
								{/* Draggable floating panel */}
								<div
									ref={panelRef}
									data-viewer-overlay-control
									className="absolute z-20 pointer-events-auto select-none"
									style={{ left: panelPos.x, top: panelPos.y }}
								>
									{panelCollapsed ? (
										<button
											type="button"
											onMouseDown={(e) => e.stopPropagation()}
											onClick={(e) => {
												e.stopPropagation();
												setPanelCollapsed(false);
											}}
											title="Expand control panel"
											className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/65 backdrop-blur-sm px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-black/80 transition-colors shadow-lg"
										>
											<span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
											Control
										</button>
									) : (
										<div className="rounded-xl border border-white/20 bg-black/65 backdrop-blur-sm w-56 shadow-xl overflow-hidden">
											{/* Drag handle */}
											<div
												className="flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-grab active:cursor-grabbing"
												onMouseDown={handlePanelDragStart}
											>
												<div className="flex items-center gap-2 min-w-0">
													<svg
														width="12"
														height="12"
														viewBox="0 0 12 12"
														fill="currentColor"
														className="text-white/40 shrink-0"
													>
														<circle cx="3" cy="3" r="1.2" />
														<circle cx="9" cy="3" r="1.2" />
														<circle cx="3" cy="6" r="1.2" />
														<circle cx="9" cy="6" r="1.2" />
														<circle cx="3" cy="9" r="1.2" />
														<circle cx="9" cy="9" r="1.2" />
													</svg>
													<span className="text-[11px] font-medium text-white/80 truncate">
														{agent.label ?? agent.agent_id}
													</span>
												</div>
												<button
													type="button"
													onMouseDown={(e) => e.stopPropagation()}
													onClick={(e) => {
														e.stopPropagation();
														setPanelCollapsed(true);
													}}
													title="Collapse panel"
													className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors ml-1"
												>
													<svg
														width="10"
														height="10"
														viewBox="0 0 10 10"
														fill="none"
														stroke="currentColor"
														strokeWidth="1.5"
														strokeLinecap="round"
													>
														<path d="M2 7l3-3 3 3" />
													</svg>
												</button>
											</div>
											{/* Panel body */}
											<div className="p-3 space-y-3">
												<div className="flex items-center gap-2 flex-wrap">
													<label
														htmlFor="ctrl-viewer-mode"
														className="text-[11px] uppercase tracking-[0.14em] text-white/60"
													>
														Mode
													</label>
													<select
														data-viewer-overlay-control
														id="ctrl-viewer-mode"
														value={viewerMode}
														onChange={(ev) =>
															setViewerMode(ev.target.value as "player" | "control")
														}
														onMouseDown={(e) => e.stopPropagation()}
														className="rounded-lg border border-white/20 bg-black/45 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white focus:border-accent focus:outline-none"
													>
														<option value="player">Player</option>
														<option value="control" disabled={!hasHostInputPermissions}>
															Control
														</option>
													</select>
													<span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest bg-accent/35 text-white">
														Armed
													</span>
												</div>
												<div className="flex flex-wrap gap-1.5">
													{hostAllowedFeatures.map((feature) => {
														const Icon = feature.icon;
														const active = feature.hostEnabled && feature.localEnabled;
														return (
															<button
																key={feature.key}
																type="button"
																onMouseDown={(e) => e.stopPropagation()}
																onClick={(e) => {
																	e.stopPropagation();
																	toggleLocalFeature(feature.key as LocalFeature);
																}}
																title={feature.label}
																className={[
																	"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
																	active
																		? "border-accent/60 bg-accent/20 text-white"
																		: "border-white/15 bg-black/35 text-white/55",
																].join(" ")}
															>
																<Icon className="w-3 h-3" />
																<span>{feature.key}</span>
															</button>
														);
													})}
													{hostAllowedFeatures.length === 0 && (
														<p className="text-[11px] text-white/40 italic">No host permissions</p>
													)}
												</div>
												<div className="flex items-center justify-between">
													<p className="text-[10px] text-white/35">Esc — exit control</p>
													<button
														type="button"
														onMouseDown={(e) => e.stopPropagation()}
														onClick={(e) => {
															e.stopPropagation();
															disconnect();
														}}
														className="text-[11px] text-red-400 hover:text-red-300 transition-colors font-medium"
													>
														Disconnect
													</button>
												</div>
											</div>
										</div>
									)}
								</div>
								{/* Compact bottom bar in control mode */}
								<div className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-4 flex items-end justify-between pointer-events-auto">
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={togglePause}
											title={paused ? "Resume" : "Pause"}
											className="w-9 h-9 flex items-center justify-center rounded-full bg-black/55 hover:bg-black/75 text-white transition-colors"
										>
											{paused ? <PlayIcon /> : <PauseIcon />}
										</button>
										{audioControlEnabled && (
											<>
												<button
													type="button"
													onClick={toggleMute}
													title={muted ? "Unmute" : "Mute"}
													className="w-9 h-9 flex items-center justify-center rounded-full bg-black/55 hover:bg-black/75 text-white transition-colors"
												>
													{muted ? <MuteIcon /> : <VolumeIcon />}
												</button>
												<input
													type="range"
													min={0}
													max={100}
													value={Math.round(volume * 100)}
													onChange={(e) => setVolume(Number(e.target.value) / 100)}
													aria-label="Volume"
													onMouseDown={(e) => e.stopPropagation()}
													className="max-w-16 md:max-w-24 h-1.5 accent-accent cursor-pointer"
												/>
											</>
										)}
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
											className="w-9 h-9 flex items-center justify-center rounded-full bg-black/55 hover:bg-black/75 text-white transition-colors"
										>
											{isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
										</button>
									</div>
								</div>
							</>
						)}
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
