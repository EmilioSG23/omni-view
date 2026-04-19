// ─── WebRTC host logic ────────────────────────────────────────────────────────
// Handles signaling WebSocket, peer connections, capture state, and viewer list
// for a browser device acting as a host agent.

import type { ViewerInfo } from "@omni-view/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSenderPeer, getSignalingUrl, sha256hex } from "../core/webrtc";
import { agentApi } from "../services/agent-api";

export type CaptureState = "idle" | "requesting" | "active" | "error";

export interface UseWebRTCHostResult {
	captureState: CaptureState;
	viewers: ViewerInfo[];
	startCapture: () => Promise<void>;
	stopCapture: () => void;
	kickViewer: (viewerId: string) => Promise<void>;
}

export function useWebRTCHost(agentId: string, password: string): UseWebRTCHostResult {
	const [captureState, setCaptureState] = useState<CaptureState>("idle");
	const [viewers, setViewers] = useState<ViewerInfo[]>([]);

	const streamRef = useRef<MediaStream | null>(null);
	const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
	const wsRef = useRef<WebSocket | null>(null);

	const stopCapture = useCallback(() => {
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
		for (const pc of peersRef.current.values()) pc.close();
		peersRef.current.clear();
		wsRef.current?.close();
		wsRef.current = null;
		setViewers([]);
		setCaptureState("idle");
	}, []);

	const connectSignaling = useCallback(
		(stream: MediaStream) => {
			const ws = new WebSocket(getSignalingUrl());
			wsRef.current = ws;

			ws.onopen = async () => {
				const passwordHash = password ? await sha256hex(password) : "";
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

				if (msgEvent === "viewer:joined") {
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
						if (candidate && ws.readyState === WebSocket.OPEN) {
							ws.send(
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
			};
		},
		[agentId, password],
	);

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
			connectSignaling(stream);
			setCaptureState("active");
		} catch {
			setCaptureState("error");
		}
	}, [captureState, connectSignaling, stopCapture]);

	const kickViewer = useCallback(
		async (viewerId: string) => {
			await agentApi.kickViewer(agentId, viewerId);
			peersRef.current.get(viewerId)?.close();
			peersRef.current.delete(viewerId);
			setViewers((prev) => prev.filter((v) => v.viewer_id !== viewerId));
		},
		[agentId],
	);

	// Clean up on unmount
	useEffect(() => () => stopCapture(), [stopCapture]);

	return { captureState, viewers, startCapture, stopCapture, kickViewer };
}
