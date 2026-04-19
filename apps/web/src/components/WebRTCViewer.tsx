import type { AgentSummary } from "@omni-view/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId } from "../core/device-identity";
import { createReceiverPeer, getSignalingUrl } from "../utils/webrtc";

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "rejected";

interface WebRTCViewerProps {
	agent: AgentSummary;
	/** Pre-filled password (from the ConnectToAgentForm flow). */
	password?: string;
}

export function WebRTCViewer({ agent, password: initialPassword }: WebRTCViewerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const wsRef = useRef<WebSocket | null>(null);

	const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
	const [error, setError] = useState<string | null>(null);

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

	const isActive = connectionState === "connected";
	const isConnecting = connectionState === "connecting";

	return (
		<div className="flex flex-col h-full w-full bg-base rounded-xl overflow-hidden border border-border">
			{/* Video stage */}
			<div className="relative flex-1 bg-black flex items-center justify-center min-h-0">
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
						{connectionState === "idle" && <p className="text-sm">Waiting for connection.</p>}
						{(connectionState === "disconnected" || connectionState === "rejected") && (
							<>
								<p className="text-sm text-error">{error ?? "Disconnected."}</p>
								{connectionState === "disconnected" && initialPassword && (
									<button
										type="button"
										onClick={() => void connect(initialPassword)}
										className="px-4 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold"
									>
										Reconnect
									</button>
								)}
							</>
						)}
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border bg-surface">
				<div className="flex items-center gap-2 min-w-0">
					<span
						className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "bg-success" : "bg-muted"}`}
					/>
					<span className="text-xs text-muted font-mono truncate">
						{agent.label ?? agent.agent_id}
					</span>
				</div>
				{isActive && (
					<button
						type="button"
						onClick={disconnect}
						className="px-3 py-1 rounded text-xs text-error hover:bg-error/10 transition-colors"
					>
						Disconnect
					</button>
				)}
			</div>
		</div>
	);
}
