// ─── WebRTC viewer logic ──────────────────────────────────────────────────────
// Encapsulates WebSocket signaling, RTCPeerConnection, and UI interaction state
// for a browser device acting as a WebRTC stream viewer.

import { createReceiverPeer, getSignalingUrl } from "@/core/webrtc";
import { getDeviceId } from "@/utils/device-identity";
import type { AgentSummary, QualityPreset } from "@omni-view/shared";
import { SIGNALING } from "@omni-view/shared";
import React, { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionState =
	| "idle"
	| "connecting"
	| "pending"
	| "connected"
	| "disconnected"
	| "rejected";

export interface UseWebRTCViewerResult {
	containerRef: React.RefObject<HTMLDivElement | null>;
	videoRef: React.RefObject<HTMLVideoElement | null>;
	connectionState: ConnectionState;
	error: string | null;
	paused: boolean;
	muted: boolean;
	volume: number;
	setVolume: (v: number) => void;
	isFullscreen: boolean;
	showControls: boolean;
	pendingPassword: string;
	viewerQuality: Exclude<QualityPreset, "custom"> | null;
	setPendingPassword: React.Dispatch<React.SetStateAction<string>>;
	connect: (password: string) => Promise<void>;
	disconnect: () => void;
	togglePause: () => void;
	toggleMute: () => void;
	toggleFullscreen: () => void;
	setViewerQuality: (preset: Exclude<QualityPreset, "custom">) => void;
	handleMouseEnter: () => void;
	handleMouseLeave: () => void;
	handleMouseMove: () => void;
	handleTouchEnd: (e: React.TouchEvent) => void;
	isActive: boolean;
	isConnecting: boolean;
	isPending: boolean;
}

const AUTO_HIDE_MS = 3000;
const CONNECT_TIMEOUT_MS = 15000;

export function useWebRTCViewer(
	agent: AgentSummary,
	initialPassword?: string,
): UseWebRTCViewerResult {
	const containerRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const LS_VOLUME_KEY = "omni-view.viewer.volume";
	const getInitialVolume = () => {
		if (typeof window === "undefined") return 1;
		try {
			const raw = localStorage.getItem(LS_VOLUME_KEY);
			if (raw == null) return 1;
			const n = parseFloat(raw);
			return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
		} catch {
			return 1;
		}
	};
	const initialVolume = getInitialVolume();
	const volumeRef = useRef<number>(initialVolume);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const connectAttemptRef = useRef(0);
	const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [paused, setPaused] = useState(false);
	const [volume, setVolumeState] = useState<number>(initialVolume);
	const lastNonZeroRef = useRef<number>(1);
	const [viewerQuality, setViewerQualityState] = useState<Exclude<QualityPreset, "custom"> | null>(
		null,
	);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showControls, setShowControls] = useState(false);

	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [pendingPassword, setPendingPassword] = useState(initialPassword ?? "");

	const viewerId = getDeviceId();

	const clearConnectTimeout = useCallback(() => {
		if (connectTimeoutRef.current) {
			clearTimeout(connectTimeoutRef.current);
			connectTimeoutRef.current = null;
		}
	}, []);

	const closeSocketSafely = useCallback((ws: WebSocket | null) => {
		if (!ws) return;
		ws.onopen = null;
		ws.onmessage = null;
		ws.onclose = null;
		ws.onerror = null;
		if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
			ws.close();
		}
	}, []);

	const closePeerSafely = useCallback((pc: RTCPeerConnection | null) => {
		if (!pc) return;
		pc.ontrack = null;
		pc.onconnectionstatechange = null;
		pc.onicecandidate = null;
		pc.close();
	}, []);

	const cleanupCurrentConnection = useCallback(
		(clearVideo: boolean) => {
			const ws = wsRef.current;
			const pc = pcRef.current;
			wsRef.current = null;
			pcRef.current = null;
			clearConnectTimeout();
			closeSocketSafely(ws);
			closePeerSafely(pc);
			if (clearVideo && videoRef.current) {
				videoRef.current.srcObject = null;
			}
		},
		[clearConnectTimeout, closePeerSafely, closeSocketSafely],
	);

	const connect = useCallback(
		async (password: string) => {
			const attemptId = ++connectAttemptRef.current;
			cleanupCurrentConnection(true);
			setConnectionState("connecting");
			setError(null);

			const ws = new WebSocket(getSignalingUrl());
			wsRef.current = ws;

			const pc = await createReceiverPeer();
			pcRef.current = pc;

			const armConnectTimeout = (phase: "connecting" | "pending") => {
				clearConnectTimeout();
				connectTimeoutRef.current = setTimeout(() => {
					if (connectAttemptRef.current !== attemptId) return;
					setConnectionState("disconnected");
					setError(
						phase === "pending"
							? "Timed out waiting for host approval. Try reconnecting."
							: "Connection timed out. Try reconnecting.",
					);
					cleanupCurrentConnection(true);
				}, CONNECT_TIMEOUT_MS);
			};

			armConnectTimeout("connecting");

			pc.ontrack = (event) => {
				if (connectAttemptRef.current !== attemptId) return;
				if (videoRef.current && event.streams[0]) {
					videoRef.current.srcObject = event.streams[0];
					videoRef.current.muted = volumeRef.current === 0;
					videoRef.current.volume = volumeRef.current;
				}
			};

			pc.onconnectionstatechange = () => {
				if (connectAttemptRef.current !== attemptId) return;
				if (pc.connectionState === "connected") {
					clearConnectTimeout();
					setConnectionState("connected");
				} else if (
					pc.connectionState === "disconnected" ||
					pc.connectionState === "failed" ||
					pc.connectionState === "closed"
				) {
					clearConnectTimeout();
					setConnectionState("disconnected");
				}
			};

			pc.onicecandidate = ({ candidate }) => {
				if (connectAttemptRef.current !== attemptId) return;
				if (candidate && ws.readyState === WebSocket.OPEN) {
					ws.send(
						JSON.stringify({
							event: SIGNALING.WEBRTC_ICE,
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
				try {
					if (connectAttemptRef.current !== attemptId) return;
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(
							JSON.stringify({
								event: SIGNALING.VIEWER_REQUEST,
								data: {
									agentId: agent.agent_id,
									viewerId,
									password,
									label: navigator.userAgent.slice(0, 40),
								},
							}),
						);
					}
				} catch (err) {
					if (connectAttemptRef.current !== attemptId) return;
					setError("WebSocket closed before the connection was established.");
					setConnectionState("rejected");
					cleanupCurrentConnection(true);
				}
			};

			ws.onerror = (ev) => {
				if (connectAttemptRef.current !== attemptId) return;
				clearConnectTimeout();
				setError("WebSocket error");
				setConnectionState("disconnected");
				cleanupCurrentConnection(true);
			};

			ws.onmessage = async (event: MessageEvent<string>) => {
				if (connectAttemptRef.current !== attemptId) return;
				let msg: Record<string, unknown>;
				try {
					msg = JSON.parse(event.data) as Record<string, unknown>;
				} catch {
					return;
				}

				const msgEvent = msg.event as string | undefined;

				if (msgEvent === SIGNALING.VIEWER_PENDING) {
					setConnectionState("pending");
					armConnectTimeout("pending");
					return;
				}

				if (msgEvent === SIGNALING.VIEWER_APPROVED) {
					setConnectionState("connecting");
					armConnectTimeout("connecting");
					return;
				}

				if (msgEvent === SIGNALING.VIEWER_REJECTED) {
					const reason = msg.reason as string;
					setError(
						reason === "invalid_password"
							? "Incorrect password."
							: reason === "approval_timeout"
								? "Timed out waiting for host approval."
								: reason === "blacklisted"
									? "Access denied. The host has blocked this device."
									: reason === "denied"
										? "Access denied by the host."
										: "Host is not available. Start screen sharing first.",
					);
					setConnectionState("rejected");
					cleanupCurrentConnection(true);
					return;
				}

				if (msgEvent === SIGNALING.WEBRTC_OFFER) {
					const sdp = msg.sdp as RTCSessionDescriptionInit;
					await pc.setRemoteDescription(sdp);
					const answer = await pc.createAnswer();
					await pc.setLocalDescription(answer);
					ws.send(
						JSON.stringify({
							event: SIGNALING.WEBRTC_ANSWER,
							data: {
								agentId: agent.agent_id,
								viewerId,
								sdp: { type: answer.type, sdp: answer.sdp },
							},
						}),
					);
				}

				if (msgEvent === SIGNALING.WEBRTC_ICE) {
					const candidate = msg.candidate as RTCIceCandidateInit;
					await pc.addIceCandidate(candidate);
				}

				if (msgEvent === SIGNALING.HOST_DISCONNECTED) {
					clearConnectTimeout();
					setConnectionState("disconnected");
					setError("The host stopped sharing.");
				}

				if (msgEvent === SIGNALING.VIEWER_KICKED) {
					setConnectionState("disconnected");
					setError("You were removed by the host.");
					cleanupCurrentConnection(true);
				}
			};

			ws.onclose = () => {
				if (connectAttemptRef.current !== attemptId) return;
				clearConnectTimeout();
				setConnectionState((s) =>
					s === "connected" || s === "connecting" || s === "pending" ? "disconnected" : s,
				);
			};
		},
		[agent.agent_id, cleanupCurrentConnection, clearConnectTimeout, viewerId],
	);

	// Auto-connect when component mounts if a password is provided
	useEffect(() => {
		if (initialPassword) {
			void connect(initialPassword);
		}
		return () => {
			connectAttemptRef.current += 1;
			cleanupCurrentConnection(true);
		};
		// Connect once on mount with the initial password
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cleanupCurrentConnection, connect, initialPassword]);

	const disconnect = () => {
		connectAttemptRef.current += 1;
		cleanupCurrentConnection(true);
		setConnectionState("idle");
		setError(null);
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

	const setVolume = useCallback((v: number) => {
		const next = Math.max(0, Math.min(1, v));
		setVolumeState(next);
		volumeRef.current = next;
		try {
			localStorage.setItem(LS_VOLUME_KEY, String(next));
		} catch {}
		if (next > 0) lastNonZeroRef.current = next;
		if (videoRef.current) {
			videoRef.current.volume = next;
			videoRef.current.muted = next === 0;
		}
	}, []);

	const toggleMute = useCallback(() => {
		const currentlyMuted = videoRef.current ? videoRef.current.muted : volume === 0;
		if (currentlyMuted) {
			const restore = lastNonZeroRef.current ?? 1;
			setVolume(restore);
		} else {
			if (volume > 0) lastNonZeroRef.current = volume;
			setVolume(0);
		}
	}, [volume, setVolume]);

	useEffect(() => {
		const v = videoRef.current;
		if (!v) return;
		v.muted = volume === 0;
		v.volume = volume;
	}, [volume]);

	const setViewerQuality = useCallback(
		(preset: Exclude<QualityPreset, "custom">) => {
			setViewerQualityState(preset);
			const ws = wsRef.current;
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						event: SIGNALING.VIEWER_CONFIG,
						data: { agentId: agent.agent_id, viewerId, preset },
					}),
				);
			}
		},
		[agent.agent_id, viewerId],
	);

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
	const isPending = connectionState === "pending";

	return {
		containerRef,
		videoRef,
		connectionState,
		error,
		paused,
		muted: volume === 0,
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
	};
}
