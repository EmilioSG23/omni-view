// ─── WebRTC host logic ────────────────────────────────────────────────────────
// Handles signaling WebSocket, peer connections, capture state, and viewer list
// for a browser device acting as a host agent.

import { createSenderPeer, getSignalingUrl, sha256hex } from "@/core/webrtc";
import { agentApi } from "@/services/agent-api";
import type { ViewerInfo } from "@omni-view/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export type CaptureState = "idle" | "requesting" | "active" | "error";

export interface UseWebRTCHostOptions {
	onAccessRequested?: (requestId: string, deviceId: string, label?: string) => void;
}

export interface UseWebRTCHostResult {
	captureState: CaptureState;
	viewers: ViewerInfo[];
	startCapture: () => Promise<void>;
	stopCapture: () => void;
	kickViewer: (viewerId: string) => Promise<void>;
	grantAccess: (requestId: string) => void;
	denyAccess: (requestId: string, blacklist?: boolean) => void;
	/** Re-sends host:join to the gateway with the given password's hash.
	 * Must be called after saving a new password so the gateway hash stays in sync. */
	updatePassword: (pw: string) => Promise<void>;
}

export function useWebRTCHost(
	agentId: string,
	password: string,
	options?: UseWebRTCHostOptions,
): UseWebRTCHostResult {
	const [captureState, setCaptureState] = useState<CaptureState>("idle");
	const [viewers, setViewers] = useState<ViewerInfo[]>([]);

	const streamRef = useRef<MediaStream | null>(null);
	const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
	const wsRef = useRef<WebSocket | null>(null);

	// Stable refs so the effect closure always sees the latest values.
	const passwordRef = useRef(password);
	passwordRef.current = password;

	const onAccessRequestedRef = useRef(options?.onAccessRequested);
	onAccessRequestedRef.current = options?.onAccessRequested;

	const stopCapture = useCallback(() => {
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
		for (const pc of peersRef.current.values()) pc.close();
		peersRef.current.clear();
		setViewers([]);
		setCaptureState("idle");
	}, []);

	// Always-on signaling connection. Reconnects automatically on unexpected close.
	useEffect(() => {
		let destroyed = false;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

		function openWs() {
			const ws = new WebSocket(getSignalingUrl());
			wsRef.current = ws;

			ws.onopen = async () => {
				const passwordHash = passwordRef.current ? await sha256hex(passwordRef.current) : "";
				ws.send(JSON.stringify({ event: "host:join", data: { agentId, passwordHash } }));
			};

			ws.onmessage = async (event: MessageEvent<string>) => {
				let msg: Record<string, unknown>;
				try {
					msg = JSON.parse(event.data) as Record<string, unknown>;
				} catch {
					return;
				}

				const msgEvent = msg.event as string | undefined;

				if (msgEvent === "access:requested") {
					const requestId = msg.requestId as string;
					const deviceId = msg.deviceId as string;
					const label = msg.label as string | undefined;
					onAccessRequestedRef.current?.(requestId, deviceId, label);
					return;
				}

				if (msgEvent === "viewer:joined" && streamRef.current) {
					const stream = streamRef.current;
					const viewerId = msg.viewerId as string;
					const label = msg.label as string | undefined;
					const connectedAt = new Date().toISOString();

					const pc = createSenderPeer(stream);
					peersRef.current.set(viewerId, pc);
					setViewers((prev) => [
						...prev,
						{ viewer_id: viewerId, label, connected_at: connectedAt },
					]);

					pc.onicecandidate = ({ candidate }) => {
						const currentWs = wsRef.current;
						if (candidate && currentWs && currentWs.readyState === WebSocket.OPEN) {
							currentWs.send(
								JSON.stringify({
									event: "webrtc:ice",
									data: {
										agentId,
										viewerId,
										candidate: {
											candidate: candidate.candidate,
											sdpMid: candidate.sdpMid,
											sdpMLineIndex: candidate.sdpMLineIndex,
										},
										fromHost: true,
									},
								}),
							);
						}
					};

					const offer = await pc.createOffer();
					await pc.setLocalDescription(offer);
					ws.send(
						JSON.stringify({
							event: "webrtc:offer",
							data: { agentId, viewerId, sdp: { type: offer.type, sdp: offer.sdp } },
						}),
					);
				}

				if (msgEvent === "webrtc:answer") {
					const viewerId = msg.viewerId as string;
					const sdp = msg.sdp as RTCSessionDescriptionInit;
					const pc = peersRef.current.get(viewerId);
					if (pc) await pc.setRemoteDescription(sdp);
				}

				if (msgEvent === "webrtc:ice") {
					const viewerId = msg.viewerId as string;
					const candidate = msg.candidate as RTCIceCandidateInit;
					const pc = peersRef.current.get(viewerId);
					if (pc) await pc.addIceCandidate(candidate);
				}

				if (msgEvent === "viewer:left") {
					const viewerId = msg.viewerId as string;
					peersRef.current.get(viewerId)?.close();
					peersRef.current.delete(viewerId);
					setViewers((prev) => prev.filter((v) => v.viewer_id !== viewerId));
				}
			};

			ws.onclose = () => {
				setCaptureState((s) => (s === "active" ? "error" : s));
				// Reconnect after a short delay unless the effect is being cleaned up.
				if (!destroyed) {
					reconnectTimer = setTimeout(openWs, 3000);
				}
			};
		}

		openWs();

		return () => {
			destroyed = true;
			if (reconnectTimer !== null) clearTimeout(reconnectTimer);
			wsRef.current?.close();
			wsRef.current = null;
		};
	}, [agentId]);

	const startCapture = useCallback(async () => {
		if (captureState === "active") return;
		setCaptureState("requesting");
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: { frameRate: { ideal: 30, max: 60 } },
				audio: false,
			});
			streamRef.current = stream;
			stream.getVideoTracks()[0]?.addEventListener("ended", () => stopCapture());
			setCaptureState("active");
		} catch {
			setCaptureState("error");
		}
	}, [captureState, stopCapture]);

	const kickViewer = useCallback(
		async (viewerId: string) => {
			await agentApi.kickViewer(agentId, viewerId);
			peersRef.current.get(viewerId)?.close();
			peersRef.current.delete(viewerId);
			setViewers((prev) => prev.filter((v) => v.viewer_id !== viewerId));
		},
		[agentId],
	);

	const grantAccess = useCallback(
		(requestId: string) => {
			wsRef.current?.send(JSON.stringify({ event: "access:grant", data: { requestId, agentId } }));
		},
		[agentId],
	);

	const denyAccess = useCallback(
		(requestId: string, blacklist?: boolean) => {
			wsRef.current?.send(
				JSON.stringify({
					event: "access:deny",
					data: { requestId, agentId, blacklist: !!blacklist },
				}),
			);
		},
		[agentId],
	);

	const updatePassword = useCallback(
		async (pw: string) => {
			const ws = wsRef.current;
			if (!ws || ws.readyState !== WebSocket.OPEN) return;
			const passwordHash = pw ? await sha256hex(pw) : "";
			ws.send(JSON.stringify({ event: "host:join", data: { agentId, passwordHash } }));
		},
		[agentId],
	);

	// Clean up media on unmount (WS is cleaned by its own effect).
	useEffect(() => () => stopCapture(), [stopCapture]);

	return {
		captureState,
		viewers,
		startCapture,
		stopCapture,
		kickViewer,
		grantAccess,
		denyAccess,
		updatePassword,
	};
}
