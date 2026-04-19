import type { AgentSummary } from "@omni-view/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { createReceiverPeer, getSignalingUrl } from "../core/webrtc";
import { getDeviceId } from "../utils/device-identity";

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "rejected";

interface WebRTCViewerProps {
	agent: AgentSummary;
	/** Pre-filled password (from the ConnectToAgentForm flow). */
	password?: string;
}

export function WebRTCViewer({ agent, password: initialPassword }: WebRTCViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const wsRef = useRef<WebSocket | null>(null);

	const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [paused, setPaused] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showControls, setShowControls] = useState(false);

	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const AUTO_HIDE_MS = 3000;

	const [pendingPassword, setPendingPassword] = useState(initialPassword ?? "");

	const viewerId = getDeviceId();

	const connect = useCallback(
		async (password: string) => {
			setConnectionState("connecting");
			setError(null);

			const ws = new WebSocket(getSignalingUrl());
			wsRef.current = ws;

			const pc = createReceiverPeer();
			pcRef.current = pc;

			pc.ontrack = (event) => {
				if (videoRef.current && event.streams[0]) {
					videoRef.current.srcObject = event.streams[0];
				}
			};

			pc.onconnectionstatechange = () => {
				if (pc.connectionState === "connected") {
					setConnectionState("connected");
				} else if (
					pc.connectionState === "disconnected" ||
					pc.connectionState === "failed" ||
					pc.connectionState === "closed"
				) {
					setConnectionState("disconnected");
				}
			};

			pc.onicecandidate = ({ candidate }) => {
				if (candidate && ws.readyState === WebSocket.OPEN) {
					ws.send(
						JSON.stringify({
							event: "webrtc:ice",
							data: {
								agentId: agent.agent_id,
								viewerId,
								candidate: {
									candidate: candidate.candidate,
									sdpMid: candidate.sdpMid,
									sdpMLineIndex: candidate.sdpMLineIndex,
								},
								fromHost: false,
							},
						}),
					);
				}
			};

			ws.onopen = () => {
				ws.send(
					JSON.stringify({
						event: "viewer:request",
						data: {
							agentId: agent.agent_id,
							viewerId,
							password,
							label: navigator.userAgent.slice(0, 40),
						},
					}),
				);
			};

			ws.onmessage = async (event: MessageEvent<string>) => {
				let msg: Record<string, unknown>;
				try {
					msg = JSON.parse(event.data) as Record<string, unknown>;
				} catch {
					return;
				}

				const msgEvent = msg.event as string | undefined;

				if (msgEvent === "viewer:rejected") {
					const reason = msg.reason as string;
					setError(
						reason === "invalid_password"
							? "Incorrect password."
							: "Host is not available. Start screen sharing first.",
					);
					setConnectionState("rejected");
					ws.close();
					pc.close();
					return;
				}

				if (msgEvent === "webrtc:offer") {
					const sdp = msg.sdp as RTCSessionDescriptionInit;
					await pc.setRemoteDescription(sdp);
					const answer = await pc.createAnswer();
					await pc.setLocalDescription(answer);
					ws.send(
						JSON.stringify({
							event: "webrtc:answer",
							data: {
								agentId: agent.agent_id,
								viewerId,
								sdp: { type: answer.type, sdp: answer.sdp },
							},
						}),
					);
				}

				if (msgEvent === "webrtc:ice") {
					const candidate = msg.candidate as RTCIceCandidateInit;
					await pc.addIceCandidate(candidate);
				}

				if (msgEvent === "host:disconnected") {
					setConnectionState("disconnected");
					setError("The host stopped sharing.");
				}

				if (msgEvent === "viewer:kicked") {
					setConnectionState("disconnected");
					setError("You were removed by the host.");
					ws.close();
					pc.close();
				}
			};

			ws.onclose = () => {
				setConnectionState((s) => (s === "connected" || s === "connecting" ? "disconnected" : s));
			};
		},
		[agent.agent_id, viewerId],
	);

	// Auto-connect when component mounts if a password is provided
	useEffect(() => {
		if (initialPassword) {
			void connect(initialPassword);
		}
		return () => {
			wsRef.current?.close();
			pcRef.current?.close();
		};
		// Connect once on mount with the initial password
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const disconnect = () => {
		wsRef.current?.close();
		pcRef.current?.close();
		setConnectionState("idle");
		setError(null);
		if (videoRef.current) videoRef.current.srcObject = null;
	};

	const togglePause = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) {
			void video.play();
			setPaused(false);
		} else {
			video.pause();
			setPaused(true);
		}
	};

	const toggleFullscreen = () => {
		const el = containerRef.current;
		if (!el) return;
		if (!document.fullscreenElement) {
			void el.requestFullscreen();
		} else {
			void document.exitFullscreen();
		}
	};

	// Keep isFullscreen in sync with browser fullscreen changes (e.g. Escape key)
	useEffect(() => {
		const handler = () => setIsFullscreen(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", handler);
		return () => document.removeEventListener("fullscreenchange", handler);
	}, []);

	// Clear any hide timer on unmount
	useEffect(() => {
		return () => {
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current);
				hideTimerRef.current = null;
			}
		};
	}, []);

	// Controls overlay — hover on desktop, tap-toggle on touch devices
	const handleMouseEnter = () => {
		if (!window.matchMedia("(hover: none)").matches) {
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current);
				hideTimerRef.current = null;
			}
			setShowControls(true);
		}
	};
	const handleMouseLeave = () => {
		if (!window.matchMedia("(hover: none)").matches) {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
			hideTimerRef.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
		}
	};
	const handleMouseMove = () => {
		if (!window.matchMedia("(hover: none)").matches) {
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current);
			}
			setShowControls(true);
			hideTimerRef.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
		}
	};
	const handleTouchEnd = (e: React.TouchEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		// Ignore taps that occur on interactive controls (buttons or elements
		// intentionally set to receive pointer events with `pointer-events-auto`).
		if (target.closest("button, [data-webrtc-control], .pointer-events-auto")) return;
		if (window.matchMedia("(hover: none)").matches) {
			setShowControls((v) => {
				const next = !v;
				if (next) {
					if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
					hideTimerRef.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
				} else {
					if (hideTimerRef.current) {
						clearTimeout(hideTimerRef.current);
						hideTimerRef.current = null;
					}
				}
				return next;
			});
		}
	};

	const isActive = connectionState === "connected";
	const isConnecting = connectionState === "connecting";

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
									<svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
										<path d="M3 2l10 6-10 6V2z" />
									</svg>
								) : (
									<svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
										<path d="M4 2h3v12H4V2zm5 0h3v12H9V2z" />
									</svg>
								)}
							</button>
							<button
								type="button"
								onClick={toggleFullscreen}
								title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
								className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
							>
								{isFullscreen ? (
									<svg
										viewBox="0 0 16 16"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
										className="w-5 h-5"
									>
										<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
									</svg>
								) : (
									<svg
										viewBox="0 0 16 16"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
										className="w-5 h-5"
									>
										<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
									</svg>
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
