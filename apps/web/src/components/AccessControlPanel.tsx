// ─── Whitelist / Blacklist manager ───────────────────────────────────────────
// Two-tab panel listing allowed devices (whitelist) and blocked devices
// (blacklist) for this browser agent, with per-entry remove actions.

import type { BlacklistEntry, WhitelistEntry } from "@omni-view/shared";
import { useCallback, useEffect, useState } from "react";
import { useDevice } from "../context/DeviceContext";
import { agentApi } from "../services/agent-api";

type Tab = "allowed" | "blocked";

// ─── Sub-components ──────────────────────────────────────────────────────────

function TabButton({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`px-3 py-1.5 text-xs font-mono rounded-sm transition-colors cursor-pointer ${
				active
					? "bg-accent/15 text-accent border border-accent/30"
					: "text-muted hover:text-secondary border border-transparent"
			}`}
		>
			{label}
		</button>
	);
}

function EntryRow({
	label,
	deviceId,
	onRemove,
	removing,
}: {
	label: string;
	deviceId: string;
	onRemove: () => void;
	removing: boolean;
}) {
	return (
		<li className="flex items-center gap-2 py-2 border-b border-border last:border-0">
			<div className="flex-1 min-w-0">
				{label && (
					<p className="text-xs text-primary font-medium truncate" title={label}>
						{label}
					</p>
				)}
				<p className="text-xs font-mono text-muted truncate" title={deviceId}>
					{deviceId.slice(0, 8)}…{deviceId.slice(-6)}
				</p>
			</div>
			<button
				type="button"
				onClick={onRemove}
				disabled={removing}
				aria-label="Remove entry"
				className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
			>
				<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5">
					<path
						fillRule="evenodd"
						d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
						clipRule="evenodd"
					/>
				</svg>
			</button>
		</li>
	);
}

function EmptyState({ message }: { message: string }) {
	return <p className="text-xs font-mono text-muted text-center py-6">{message}</p>;
}

export function AccessControlPanel() {
	const { agentId, whitelistVersion } = useDevice();
	const [tab, setTab] = useState<Tab>("allowed");

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

	return (
		<div className="flex flex-col gap-4 p-4 bg-surface rounded-xl border border-border h-full">
			{/* Header */}
			<div className="flex items-center justify-between gap-2">
				<h2 className="font-mono text-xs text-secondary tracking-widest uppercase">
					Access Control
				</h2>
				<button
					type="button"
					onClick={() => void load()}
					disabled={loading}
					aria-label="Refresh"
					className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-secondary transition-colors cursor-pointer disabled:opacity-40"
				>
					<svg
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
						className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
					>
						<path
							fillRule="evenodd"
							d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
							clipRule="evenodd"
						/>
					</svg>
				</button>
			</div>

			{/* Tabs */}
			<div className="flex gap-1.5">
				<TabButton
					label={`Allowed${whitelist.length ? ` (${whitelist.length})` : ""}`}
					active={tab === "allowed"}
					onClick={() => setTab("allowed")}
				/>
				<TabButton
					label={`Blocked${blacklist.length ? ` (${blacklist.length})` : ""}`}
					active={tab === "blocked"}
					onClick={() => setTab("blocked")}
				/>
			</div>

			{/* Entry list */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				{loading ? (
					<p className="text-xs font-mono text-muted text-center py-6">loading…</p>
				) : tab === "allowed" ? (
					whitelist.length === 0 ? (
						<EmptyState message="No devices approved yet." />
					) : (
						<ul className="divide-y divide-transparent">
							{whitelist.map((entry) => (
								<EntryRow
									key={entry.device_id}
									deviceId={entry.device_id}
									label={entry.label ?? ""}
									onRemove={() => void removeWhitelisted(entry.device_id)}
									removing={removingIds.has(entry.device_id)}
								/>
							))}
						</ul>
					)
				) : blacklist.length === 0 ? (
					<EmptyState message="No devices blocked." />
				) : (
					<ul className="divide-y divide-transparent">
						{blacklist.map((entry) => (
							<EntryRow
								key={entry.device_id}
								deviceId={entry.device_id}
								label={entry.label ?? ""}
								onRemove={() => void removeBlacklisted(entry.device_id)}
								removing={removingIds.has(entry.device_id)}
							/>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
