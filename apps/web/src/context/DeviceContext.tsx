import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { BROWSER_AGENT_VERSION, PASSWORD_STORAGE_KEY } from "../consts";
import { sha256hex } from "../core/webrtc";
import { type CaptureState, useWebRTCHost } from "../hooks/useWebRTCHost";
import { agentApi } from "../services/agent-api";
import { getDeviceId } from "../utils/device-identity";

export type { CaptureState } from "../hooks/useWebRTCHost";

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

export function DeviceProvider({ children }: { children: ReactNode }) {
	const agentId = getDeviceId();
	const [isRegistered, setIsRegistered] = useState(false);
	const [password, setPassword] = useState<string>(
		() => localStorage.getItem(PASSWORD_STORAGE_KEY) ?? "",
	);

	const { captureState, viewers, startCapture, stopCapture, kickViewer } = useWebRTCHost(
		agentId,
		password,
	);

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
	const savePassword = useCallback(async () => {
		localStorage.setItem(PASSWORD_STORAGE_KEY, password);
		const passwordHash = password ? await sha256hex(password) : undefined;
		await agentApi.registerSelf({
			agent_id: agentId,
			version: BROWSER_AGENT_VERSION,
			capture_mode: "browser",
			password_hash: passwordHash,
		});
	}, [agentId, password]);

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
