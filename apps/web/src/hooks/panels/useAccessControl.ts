import { useDevice } from "@/context/DeviceContext";
import { agentApi } from "@/services/agent-api";
import { BlacklistEntry, WhitelistEntry } from "@omni-view/shared";
import { useCallback, useEffect, useState } from "react";

export function useAccessControl() {
	const { agentId, whitelistVersion } = useDevice();

	const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
	const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [wl, bl] = await Promise.all([
				agentApi.getWhitelist(agentId),
				agentApi.getBlacklist(agentId),
			]);
			setWhitelist(wl);
			setBlacklist(bl);
		} catch {
			// silently fail — panel is non-critical
		} finally {
			setLoading(false);
		}
	}, [agentId]);

	useEffect(() => {
		void load();
	}, [load, whitelistVersion]);

	const removeWhitelisted = useCallback(
		async (deviceId: string) => {
			setRemovingIds((prev) => new Set(prev).add(deviceId));
			try {
				await agentApi.removeFromWhitelist(agentId, deviceId);
				setWhitelist((prev) => prev.filter((e) => e.device_id !== deviceId));
			} finally {
				setRemovingIds((prev) => {
					const next = new Set(prev);
					next.delete(deviceId);
					return next;
				});
				load();
			}
		},
		[agentId],
	);

	const removeBlacklisted = useCallback(
		async (deviceId: string) => {
			setRemovingIds((prev) => new Set(prev).add(deviceId));
			try {
				await agentApi.removeFromBlacklist(agentId, deviceId);
				setBlacklist((prev) => prev.filter((e) => e.device_id !== deviceId));
			} finally {
				setRemovingIds((prev) => {
					const next = new Set(prev);
					next.delete(deviceId);
					return next;
				});
				load();
			}
		},
		[agentId],
	);

	return {
		whitelist,
		blacklist,
		load,
		loading,
		removingIds,
		removeWhitelisted,
		removeBlacklisted,
	};
}
