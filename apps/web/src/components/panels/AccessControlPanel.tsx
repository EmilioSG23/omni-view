// ─── Whitelist / Blacklist manager ───────────────────────────────────────────
// Two-tab panel listing allowed devices (whitelist) and blocked devices
// (blacklist) for this browser agent, with per-entry remove actions.

import { useAccessControl } from "@/hooks/panels/useAccessControl";
import { RefreshIcon } from "@/icons/RefreshIcon";
import { TrashIcon } from "@/icons/TrashIcon";
import { useState } from "react";

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
					{deviceId}
				</p>
			</div>
			<button
				type="button"
				onClick={onRemove}
				disabled={removing}
				aria-label="Remove entry"
				className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
			>
				<TrashIcon />
			</button>
		</li>
	);
}

function EmptyState({ message }: { message: string }) {
	return <p className="text-xs font-mono text-muted text-center py-6">{message}</p>;
}

export function AccessControlPanel() {
	const [tab, setTab] = useState<Tab>("allowed");
	const { whitelist, blacklist, load, loading, removingIds, removeWhitelisted, removeBlacklisted } =
		useAccessControl();

	return (
		<div className="flex flex-col gap-4 p-4 bg-surface rounded-xl border border-border h-full">
			{/* Header */}
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
					Access Control
				</h2>
				<button
					type="button"
					onClick={() => void load()}
					disabled={loading}
					aria-label="Refresh"
					className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-secondary transition-colors cursor-pointer disabled:opacity-40"
				>
					<RefreshIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
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
