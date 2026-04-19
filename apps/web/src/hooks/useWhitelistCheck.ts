import { getSignalingUrl } from "@/core/webrtc";
import { agentApi } from "@/services/agent-api";
import { getDeviceId } from "@/utils/device-identity";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhitelistStatus =
	| "checking"
	| "allowed"
	| "denied"
	| "pending"
	| "blacklisted"
	| "error";

export interface UseWhitelistCheck {
	status: WhitelistStatus;
	deviceId: string;
	error: string | null;
	request(label?: string): Promise<void>;
}

function generateRequestId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Checks whether the current device is on the agent's whitelist and
 * provides a WS-based function to request live access approval from the host.
 */
export function useWhitelistCheck(agentId: string): UseWhitelistCheck {
	const deviceId = getDeviceId();
	const [status, setStatus] = useState<WhitelistStatus>("checking");
	const [error, setError] = useState<string | null>(null);
	const pendingWsRef = useRef<WebSocket | null>(null);

	// Initial check: whitelist and blacklist in parallel.
	useEffect(() => {
		let cancelled = false;

		Promise.all([
			agentApi.checkWhitelist(agentId, deviceId),
			agentApi.checkBlacklist(agentId, deviceId),
		])
			.then(([wl, bl]) => {
				if (cancelled) return;
				if (bl.blocked) {
					setStatus("blacklisted");
				} else if (wl.allowed) {
					setStatus("allowed");
				} else {
					setStatus("denied");
				}
			})
			.catch((e) => {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Check failed");
					setStatus("error");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [agentId, deviceId]);

	// Clean up pending WS on unmount.
	useEffect(() => {
		return () => {
			pendingWsRef.current?.close();
		};
	}, []);

	/**
	 * Send an access request via WebSocket and wait for the host's decision.
	 * Resolves as soon as the request is sent; the status updates asynchronously
	 * when the host accepts or denies.
	 */
	const request = useCallback(
		(label?: string): Promise<void> => {
			// Clean up any previous pending connection.
			pendingWsRef.current?.close();
			pendingWsRef.current = null;

			const requestId = generateRequestId();

			return new Promise<void>((resolve, reject) => {
				const ws = new WebSocket(getSignalingUrl());
				pendingWsRef.current = ws;

				ws.onopen = () => {
					ws.send(
						JSON.stringify({
							event: "access:request",
							data: { requestId, agentId, deviceId, label },
						}),
					);
					setStatus("pending");
					setError(null);
					resolve();
				};

				ws.onmessage = (event: MessageEvent<string>) => {
					let msg: Record<string, unknown>;
					try {
						msg = JSON.parse(event.data) as Record<string, unknown>;
					} catch {
						return;
					}

					const msgEvent = msg.event as string | undefined;

					if (msgEvent === "access:granted") {
						setStatus("allowed");
						ws.close();
					}

					if (msgEvent === "access:denied") {
						const blacklisted = msg.blacklisted as boolean | undefined;
						const reason = msg.reason as string | undefined;
						if (blacklisted) {
							setStatus("blacklisted");
						} else if (reason === "host_not_available") {
							setStatus("error");
							setError("Host is offline. Ask them to start sharing first.");
						} else {
							setStatus("denied");
						}
						ws.close();
					}
				};

				ws.onerror = () => {
					setError("Could not reach signaling server.");
					setStatus("error");
					reject(new Error("WebSocket error"));
				};
			});
		},
		[agentId, deviceId],
	);

	return { status, deviceId, error, request };
}
