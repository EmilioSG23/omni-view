// ─── WebRTC host logic ────────────────────────────────────────────────────────
// Handles signaling WebSocket, peer connections, capture state, and viewer list
// for a browser device acting as a host agent.

import {
	createRemoteInputPermissionsMessage,
	isRemoteInputEventAllowed,
	parseRemoteInputMessage,
} from "@/core/remoteInput";
import { createSenderPeer, getSignalingUrl, sha256hex } from "@/core/webrtc";
import { agentApi } from "@/services/agent-api";
import type {
	CaptureSettings,
	RemoteInputEvent,
	RemoteInputPermissions,
	ViewerInfo,
} from "@omni-view/shared";
import {
	DEFAULT_REMOTE_INPUT_PERMISSIONS,
	INPUT_CHANNEL_LABEL,
	QUALITY_PRESETS,
	SIGNALING,
} from "@omni-view/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export type CaptureState = "idle" | "requesting" | "active" | "error";

export interface UseWebRTCHostOptions {
	onAccessRequested?: (requestId: string, deviceId: string, label?: string) => void;
	inputPermissions?: RemoteInputPermissions;
	onRemoteInput?: (viewerId: string, event: RemoteInputEvent) => void;
}

export interface UseWebRTCHostResult {
	captureState: CaptureState;
	viewers: ViewerInfo[];
	startCapture: (settings?: CaptureSettings) => Promise<void>;
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
	const inputChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
	const wsRef = useRef<WebSocket | null>(null);

	// Stable refs so the effect closure always sees the latest values.
	const passwordRef = useRef(password);
	passwordRef.current = password;

	const onAccessRequestedRef = useRef(options?.onAccessRequested);
	onAccessRequestedRef.current = options?.onAccessRequested;

	const inputPermissionsRef = useRef(options?.inputPermissions ?? DEFAULT_REMOTE_INPUT_PERMISSIONS);
	inputPermissionsRef.current = options?.inputPermissions ?? DEFAULT_REMOTE_INPUT_PERMISSIONS;

	const onRemoteInputRef = useRef(options?.onRemoteInput);
	onRemoteInputRef.current = options?.onRemoteInput;

	const sendPermissionsToViewer = useCallback((viewerId: string, channel?: RTCDataChannel) => {
		const targetChannel = channel ?? inputChannelsRef.current.get(viewerId);
		if (!targetChannel || targetChannel.readyState !== "open") {
			return;
		}

		targetChannel.send(
			JSON.stringify(
				createRemoteInputPermissionsMessage(inputPermissionsRef.current, { viewerId }),
			),
		);
	}, []);

	const broadcastPermissions = useCallback(() => {
		for (const [viewerId, channel] of inputChannelsRef.current.entries()) {
			sendPermissionsToViewer(viewerId, channel);
		}
	}, [sendPermissionsToViewer]);

	const applyMediaPermissions = useCallback((permissions: RemoteInputPermissions) => {
		const stream = streamRef.current;
		if (!stream) return;
		for (const track of stream.getVideoTracks()) {
			track.enabled = permissions.video;
		}
		for (const track of stream.getAudioTracks()) {
			track.enabled = permissions.audio;
		}
	}, []);

	const attachInputChannel = useCallback(
		(viewerId: string, channel: RTCDataChannel) => {
			inputChannelsRef.current.set(viewerId, channel);

			channel.onopen = () => {
				sendPermissionsToViewer(viewerId, channel);
			};
			channel.onclose = () => {
				if (inputChannelsRef.current.get(viewerId) === channel) {
					inputChannelsRef.current.delete(viewerId);
				}
			};
			channel.onerror = () => {
				if (inputChannelsRef.current.get(viewerId) === channel) {
					inputChannelsRef.current.delete(viewerId);
				}
			};
			channel.onmessage = (event) => {
				if (typeof event.data !== "string") return;
				const message = parseRemoteInputMessage(event.data);
				if (!message) return;

				if (message.type === "input:sync-request") {
					sendPermissionsToViewer(viewerId, channel);
					return;
				}

				if (
					message.type === "input:event" &&
					isRemoteInputEventAllowed(message.event, inputPermissionsRef.current)
				) {
					onRemoteInputRef.current?.(viewerId, message.event);
				}
			};

			if (channel.readyState === "open") {
				sendPermissionsToViewer(viewerId, channel);
			}
		},
		[sendPermissionsToViewer],
	);

	const stopCapture = useCallback(() => {
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
		for (const channel of inputChannelsRef.current.values()) channel.close();
		inputChannelsRef.current.clear();
		for (const pc of peersRef.current.values()) pc.close();
		peersRef.current.clear();
		setViewers([]);
		setCaptureState("idle");
	}, []);

	useEffect(() => {
		applyMediaPermissions(inputPermissionsRef.current);
		broadcastPermissions();
	}, [applyMediaPermissions, broadcastPermissions, options?.inputPermissions]);

	// Always-on signaling connection. Reconnects automatically on unexpected close.
	useEffect(() => {
		let destroyed = false;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

		function openWs() {
			const ws = new WebSocket(getSignalingUrl());
			wsRef.current = ws;

			ws.onopen = async () => {
				const passwordHash = passwordRef.current ? await sha256hex(passwordRef.current) : "";
				ws.send(JSON.stringify({ event: SIGNALING.HOST_JOIN, data: { agentId, passwordHash } }));
			};

			ws.onmessage = async (event: MessageEvent<string>) => {
				let msg: Record<string, unknown>;
				try {
					msg = JSON.parse(event.data) as Record<string, unknown>;
				} catch {
					return;
				}

				const msgEvent = msg.event as string | undefined;

				if (msgEvent === SIGNALING.ACCESS_REQUESTED) {
					const requestId = msg.requestId as string;
					const deviceId = msg.deviceId as string;
					const label = msg.label as string | undefined;
					onAccessRequestedRef.current?.(requestId, deviceId, label);
					return;
				}

				if (msgEvent === SIGNALING.VIEWER_JOINED && streamRef.current) {
					const stream = streamRef.current;
					const viewerId = msg.viewerId as string;
					const label = msg.label as string | undefined;
					const connectedAt = new Date().toISOString();

					const pc = await createSenderPeer(stream);
					peersRef.current.set(viewerId, pc);
					const inputChannel = pc.createDataChannel(INPUT_CHANNEL_LABEL, {
						ordered: true,
					});
					attachInputChannel(viewerId, inputChannel);
					pc.ondatachannel = ({ channel }) => {
						if (channel.label !== INPUT_CHANNEL_LABEL) return;
						attachInputChannel(viewerId, channel);
					};
					setViewers((prev) => [
						...prev,
						{ viewer_id: viewerId, label, connected_at: connectedAt },
					]);

					pc.onicecandidate = ({ candidate }) => {
						const currentWs = wsRef.current;
						if (candidate && currentWs && currentWs.readyState === WebSocket.OPEN) {
							currentWs.send(
								JSON.stringify({
									event: SIGNALING.WEBRTC_ICE,
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
							event: SIGNALING.WEBRTC_OFFER,
							data: { agentId, viewerId, sdp: { type: offer.type, sdp: offer.sdp } },
						}),
					);
				}

				if (msgEvent === SIGNALING.WEBRTC_ANSWER) {
					const viewerId = msg.viewerId as string;
					const sdp = msg.sdp as RTCSessionDescriptionInit;
					const pc = peersRef.current.get(viewerId);
					if (pc) await pc.setRemoteDescription(sdp);
				}

				if (msgEvent === SIGNALING.WEBRTC_ICE) {
					const viewerId = msg.viewerId as string;
					const candidate = msg.candidate as RTCIceCandidateInit;
					const pc = peersRef.current.get(viewerId);
					if (pc) await pc.addIceCandidate(candidate);
				}

				if (msgEvent === SIGNALING.VIEWER_LEFT) {
					const viewerId = msg.viewerId as string;
					inputChannelsRef.current.get(viewerId)?.close();
					inputChannelsRef.current.delete(viewerId);
					peersRef.current.get(viewerId)?.close();
					peersRef.current.delete(viewerId);
					setViewers((prev) => prev.filter((v) => v.viewer_id !== viewerId));
				}

				if (msgEvent === SIGNALING.VIEWER_CONFIG) {
					const preset = msg.preset as keyof typeof QUALITY_PRESETS;
					if (!(preset in QUALITY_PRESETS)) return;
					const bitrateMap: Record<keyof typeof QUALITY_PRESETS, number> = {
						performance: 500_000,
						balanced: 1_500_000,
						quality: 4_000_000,
					};
					const maxBitrate = bitrateMap[preset];
					for (const pc of peersRef.current.values()) {
						for (const sender of pc.getSenders()) {
							const params = sender.getParameters();
							if (!params.encodings || params.encodings.length === 0) {
								params.encodings = [{}];
							}
							for (const enc of params.encodings) {
								enc.maxBitrate = maxBitrate;
							}
							sender.setParameters(params).catch(() => {
								// setParameters may not be supported in all browsers; silently ignore.
							});
						}
					}
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

	const startCapture = useCallback(
		async (settings?: CaptureSettings) => {
			if (captureState === "active") return;
			setCaptureState("requesting");
			const fps = settings?.fps ?? 30;
			try {
				const stream = await navigator.mediaDevices.getDisplayMedia({
					video: { frameRate: { ideal: fps, max: fps * 2 } },
					audio: settings?.audio && inputPermissionsRef.current.audio,
				});
				streamRef.current = stream;
				applyMediaPermissions(inputPermissionsRef.current);
				stream.getVideoTracks()[0]?.addEventListener("ended", () => stopCapture());
				setCaptureState("active");
			} catch {
				setCaptureState("error");
			}
		},
		[applyMediaPermissions, captureState, stopCapture],
	);

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
			wsRef.current?.send(
				JSON.stringify({ event: SIGNALING.ACCESS_GRANT, data: { requestId, agentId } }),
			);
		},
		[agentId],
	);

	const denyAccess = useCallback(
		(requestId: string, blacklist?: boolean) => {
			wsRef.current?.send(
				JSON.stringify({
					event: SIGNALING.ACCESS_DENY,
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
			ws.send(JSON.stringify({ event: SIGNALING.HOST_JOIN, data: { agentId, passwordHash } }));
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
