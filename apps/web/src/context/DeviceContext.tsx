import type { ViewerInfo } from "@omni-view/shared";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { agentApi } from "../core/agent-api";
import { getDeviceId } from "../core/device-identity";
import { createSenderPeer, getSignalingUrl, sha256hex } from "../utils/webrtc";

export type CaptureState = "idle" | "requesting" | "active" | "error";

export interface DeviceContextType {
	/** This browser device's stable agent ID. */
	agentId: string;
	/** Whether the agent has been successfully registered with the backend. */
	isRegistered: boolean;
	/** The current plain-text session password (never sent to backend as-is). */
	password: string;
	/** Update the in-memory password. Call `savePassword` to persist it to the backend. */
	setPassword: (pw: string) => void;
	/** Hash and store the current password on the backend. */
	savePassword: () => Promise<void>;
	/** Current capture state. */
	captureState: CaptureState;
	/** Request display media and begin broadcasting to connected viewers. */
	startCapture: () => Promise<void>;
	/** Stop broadcasting and close all peer connections. */
	stopCapture: () => void;
	/** Viewers currently connected via WebRTC. */
	viewers: ViewerInfo[];
	/** Kick a viewer. */
	kickViewer: (viewerId: string) => Promise<void>;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

/** Application version reported to the backend for this browser agent. */
const BROWSER_AGENT_VERSION = "web/1.0";

export function DeviceProvider({ children }: { children: ReactNode }) {
	const agentId = getDeviceId();
	const [isRegistered, setIsRegistered] = useState(false);
	const [password, setPassword] = useState<string>(
		() => localStorage.getItem("omniview:agent_password") ?? "",
	);
	const [captureState, setCaptureState] = useState<CaptureState>("idle");
	const [viewers, setViewers] = useState<ViewerInfo[]>([]);

	// WebRTC state
	const streamRef = useRef<MediaStream | null>(null);
	const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
	const wsRef = useRef<WebSocket | null>(null);

	// ── Register this device on mount ──────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const passwordHash = password ? await sha256hex(password) : undefined;
				await agentApi.registerSelf({
					agent_id: agentId,
					version: BROWSER_AGENT_VERSION,
					capture_mode: "browser",
					password_hash: passwordHash,
				});
				if (!cancelled) setIsRegistered(true);
			} catch {
				// Non-fatal — user still sees the panel but capture is disabled.
			}
		})();
		return () => {
			cancelled = true;
		};
		// Run once on mount only.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [agentId]);

	// ── Signaling WebSocket ────────────────────────────────────────────────────
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

					// Create a new peer for this viewer
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

					// Create and send offer
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
					if (pc) {
						await pc.setRemoteDescription(sdp);
					}
				}

				if (msgEvent === "webrtc:ice") {
					const viewerId = msg.viewerId as string;
					const candidate = msg.candidate as RTCIceCandidateInit;
					const pc = peersRef.current.get(viewerId);
					if (pc) {
						await pc.addIceCandidate(candidate);
					}
				}

				if (msgEvent === "viewer:left") {
					const viewerId = msg.viewerId as string;
					peersRef.current.get(viewerId)?.close();
					peersRef.current.delete(viewerId);
					setViewers((prev) => prev.filter((v) => v.viewer_id !== viewerId));
				}
			};

			ws.onclose = () => {
				// If still capturing, mark as errored so UI can show a reconnect button
				setCaptureState((s) => (s === "active" ? "error" : s));
			};
		},
		[agentId, password],
	);

	// ── Capture controls ───────────────────────────────────────────────────────
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
		// stopCapture is stable (no deps)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [captureState, connectSignaling]);

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

	// Clean up on unmount
	useEffect(() => () => stopCapture(), [stopCapture]);

	// ── Password management ────────────────────────────────────────────────────
	const savePassword = useCallback(async () => {
		localStorage.setItem("omniview:agent_password", password);
		const passwordHash = password ? await sha256hex(password) : undefined;
		await agentApi.registerSelf({
			agent_id: agentId,
			version: BROWSER_AGENT_VERSION,
			capture_mode: "browser",
			password_hash: passwordHash,
		});
	}, [agentId, password]);

	// ── Viewer management ──────────────────────────────────────────────────────
	const kickViewer = useCallback(
		async (viewerId: string) => {
			await agentApi.kickViewer(agentId, viewerId);
			peersRef.current.get(viewerId)?.close();
			peersRef.current.delete(viewerId);
			setViewers((prev) => prev.filter((v) => v.viewer_id !== viewerId));
		},
		[agentId],
	);

	return (
		<DeviceContext.Provider
			value={{
				agentId,
				isRegistered,
				password,
				setPassword,
				savePassword,
				captureState,
				startCapture,
				stopCapture,
				viewers,
				kickViewer,
			}}
		>
			{children}
		</DeviceContext.Provider>
	);
}

export function useDevice(): DeviceContextType {
	const ctx = useContext(DeviceContext);
	if (!ctx) throw new Error("useDevice must be used inside <DeviceProvider>");
	return ctx;
}
