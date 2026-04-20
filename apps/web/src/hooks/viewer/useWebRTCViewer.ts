// ─── WebRTC viewer logic ──────────────────────────────────────────────────────
// Encapsulates WebSocket signaling, RTCPeerConnection, and UI interaction state
// for a browser device acting as a WebRTC stream viewer.

import { createReceiverPeer, getSignalingUrl } from "@/core/webrtc";
import { getDeviceId } from "@/utils/device-identity";
import type { AgentSummary, QualityPreset } from "@omni-view/shared";
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

export function useWebRTCViewer(
	agent: AgentSummary,
	initialPassword?: string,
): UseWebRTCViewerResult {
	const containerRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const wsRef = useRef<WebSocket | null>(null);

	const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [paused, setPaused] = useState(false);
	const LS_VOLUME_KEY = "omni-view.viewer.volume";
	const [volume, setVolumeState] = useState<number>(() => {
		if (typeof window === "undefined") return 1;
		try {
			const raw = localStorage.getItem(LS_VOLUME_KEY);
			if (raw == null) return 1;
			const n = parseFloat(raw);
			return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
		} catch {
			return 1;
		}
	});
	const lastNonZeroRef = useRef<number>(1);
	const [viewerQuality, setViewerQualityState] = useState<Exclude<QualityPreset, "custom"> | null>(
		null,
	);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showControls, setShowControls] = useState(false);

	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
					videoRef.current.muted = volume === 0;
					videoRef.current.volume = volume;
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

				if (msgEvent === "viewer:pending") {
					setConnectionState("pending");
					return;
				}

				if (msgEvent === "viewer:approved") {
					setConnectionState("connecting");
					return;
				}

				if (msgEvent === "viewer:rejected") {
					const reason = msg.reason as string;
					setError(
						reason === "invalid_password"
							? "Incorrect password."
							: reason === "blacklisted"
								? "Access denied. The host has blocked this device."
								: reason === "denied"
									? "Access denied by the host."
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
				setConnectionState((s) =>
					s === "connected" || s === "connecting" || s === "pending" ? "disconnected" : s,
				);
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

	const setVolume = useCallback((v: number) => {
		const next = Math.max(0, Math.min(1, v));
		setVolumeState(next);
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
						event: "viewer:config",
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
