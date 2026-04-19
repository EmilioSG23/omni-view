import { useCallback, useEffect, useState } from "react";
import { agentApi } from "./agent-api";
import { getDeviceId } from "./device-identity";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhitelistStatus = "checking" | "allowed" | "denied" | "requested" | "error";

export interface UseWhitelistCheck {
	status: WhitelistStatus;
	deviceId: string;
	error: string | null;
	request(label?: string): Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Checks whether the current device is on the agent's whitelist and
 * provides a function to request access if not.
 *
 * The check runs once on mount. If the backend is unreachable the status
 * is set to "error" so the caller can still proceed with password auth.
 */
export function useWhitelistCheck(agentId: string): UseWhitelistCheck {
	const deviceId = getDeviceId();
	const [status, setStatus] = useState<WhitelistStatus>("checking");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		agentApi
			.checkWhitelist(agentId, deviceId)
			.then((res) => {
				if (!cancelled) setStatus(res.allowed ? "allowed" : "denied");
			})
			.catch((e) => {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Whitelist check failed");
					setStatus("error");
				}
			});
		return () => {
			cancelled = true;
		};
	}, [agentId, deviceId]);

	const request = useCallback(
		async (label?: string) => {
			try {
				await agentApi.addToWhitelist(agentId, { device_id: deviceId, label });
				setStatus("requested");
				setError(null);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Request failed");
			}
		},
		[agentId, deviceId],
	);

	return { status, deviceId, error, request };
}
