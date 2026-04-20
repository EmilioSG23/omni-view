import { BROWSER_AGENT_VERSION, PASSWORD_STORAGE_KEY } from "@/consts";
import { sha256hex } from "@/core/webrtc";
import { useNotifications } from "@/hooks/useNotifications";
import { type CaptureState, useWebRTCHost } from "@/hooks/viewer/useWebRTCHost";
import { agentApi } from "@/services/agent-api";
import { getDeviceId } from "@/utils/device-identity";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

export type { CaptureState } from "@/hooks/viewer/useWebRTCHost";

import type { ViewerInfo } from "@omni-view/shared";

export interface DeviceContextType {
	/** This browser device's stable agent ID. */
	agentId: string;
	/** Whether the agent has been successfully registered with the backend. */
	isRegistered: boolean;
	/** The current plain-text session password (never sent to backend as-is). */
	password: string;
	/** Update the in-memory password. Call `savePassword` to persist it to the backend. */
	setPassword: (pw: string) => void;
	/** Hash and store the current password on the backend. If `pw` is provided, use that value instead of the current in-memory password. */
	savePassword: (pw?: string) => Promise<void>;
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
	/** Grant a pending access request. */
	grantAccess: (requestId: string) => void;
	/** Deny a pending access request. Pass blacklist=true to also block the device. */
	denyAccess: (requestId: string, blacklist?: boolean) => void;
	/** Increments whenever the whitelist/blacklist changes so panels can reload. */
	whitelistVersion: number;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
	const agentId = getDeviceId();
	const [isRegistered, setIsRegistered] = useState(false);
	const [whitelistVersion, setWhitelistVersion] = useState(0);
	const [password, setPassword] = useState<string>(
		() => localStorage.getItem(PASSWORD_STORAGE_KEY) ?? "",
	);

	const { addNotification, removeNotification } = useNotifications();

	// Stable refs to avoid stale closures inside the callback passed to useWebRTCHost.
	const grantAccessRef = useRef<(requestId: string) => void>(() => {});
	const denyAccessRef = useRef<(requestId: string, blacklist?: boolean) => void>(() => {});

	const handleAccessRequested = useCallback(
		(requestId: string, deviceId: string, label?: string) => {
			const notifId = `access-${requestId}`;
			addNotification({
				id: notifId,
				message: `${label ?? deviceId} is requesting screen access`,
				status: "REQUEST",
				actions: [
					{
						label: "Accept",
						variant: "default",
						onClick: () => {
							grantAccessRef.current(requestId);
							removeNotification(notifId);
							setWhitelistVersion((v) => v + 1);
						},
					},
					{
						label: "Reject",
						variant: "danger",
						onClick: () => {
							denyAccessRef.current(requestId);
							removeNotification(notifId);
						},
					},
					{
						label: "Block",
						variant: "warn",
						onClick: () => {
							denyAccessRef.current(requestId, true);
							removeNotification(notifId);
							setWhitelistVersion((v) => v + 1);
						},
					},
				],
			});
		},
		[addNotification, removeNotification],
	);

	const {
		captureState,
		viewers,
		startCapture,
		stopCapture,
		kickViewer,
		grantAccess,
		denyAccess,
		updatePassword,
	} = useWebRTCHost(agentId, password, { onAccessRequested: handleAccessRequested });

	// Keep refs current after every render.
	grantAccessRef.current = grantAccess;
	denyAccessRef.current = denyAccess;

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

	// ── Password management ────────────────────────────────────────────────────
	const savePassword = useCallback(
		async (pw?: string) => {
			const toStore = pw ?? password;
			localStorage.setItem(PASSWORD_STORAGE_KEY, toStore);
			const passwordHash = toStore ? await sha256hex(toStore) : undefined;
			await agentApi.registerSelf({
				agent_id: agentId,
				version: BROWSER_AGENT_VERSION,
				capture_mode: "browser",
				password_hash: passwordHash,
			});
			await updatePassword(toStore);
		},
		[agentId, password, updatePassword],
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
				grantAccess,
				denyAccess,
				whitelistVersion,
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
