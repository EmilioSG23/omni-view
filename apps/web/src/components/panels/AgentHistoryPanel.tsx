import { PasswordPrompt } from "@/components/PasswordPrompt";
import type { AgentHistoryEntry } from "@/hooks/panels/useAgentHistory";
import { useModal } from "@/hooks/useModal";
import { agentApi } from "@/services/agent-api";
import { formatAge, formatDeviceId } from "@/utils/format";
import type { AgentSummary } from "@omni-view/shared";
import { useCallback, useEffect, useRef, useState } from "react";

function HistoryRow({
	entry,
	connecting,
	isActive,
	onActivate,
	onConnect,
	onRemove,
}: {
	entry: AgentHistoryEntry;
	connecting: boolean;
	isActive: boolean;
	onActivate: () => void;
	onConnect: () => void;
	onRemove: () => void;
}) {
	const displayName = entry.label ?? formatDeviceId(entry.agent_id);
	const shortId = formatDeviceId(entry.agent_id);
	const ago = formatAge(entry.last_connected_at);
	const mode = entry.capture_mode ?? "native";

	return (
		<div
			className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-elevated border border-transparent hover:border-border/60 group transition-colors cursor-pointer"
			onClick={onActivate}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onActivate();
			}}
			aria-label={`Expand actions for ${displayName}`}
		>
			{/* Left: info */}
			<div className="flex-1 min-w-0">
				<p className="text-xs font-medium text-primary truncate">{displayName}</p>
				{entry.label && <p className="text-[10px] font-mono text-muted truncate">{shortId}</p>}
				<div className="flex items-center gap-2 mt-0.5">
					<span className="text-[10px] text-muted">{ago}</span>
					<span className="text-[10px] text-muted/50">·</span>
					<span className="text-[10px] font-mono text-muted/70">{mode}</span>
				</div>
			</div>

			{/* Right: actions — always visible on mobile when active; hover-only on desktop */}
			<div
				className={`flex items-center gap-1 shrink-0 transition-opacity ${
					isActive
						? "opacity-100"
						: "opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
				}`}
			>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onConnect();
					}}
					disabled={connecting}
					className="text-accent text-[11px] font-semibold px-2 py-1 rounded hover:bg-accent/10 active:bg-accent/20 transition-colors disabled:opacity-40"
				>
					{connecting ? "…" : "Connect"}
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					title="Remove from history"
					className="text-muted hover:text-error text-[11px] px-1.5 py-1 rounded transition-colors"
					aria-label="Remove from history"
				>
					✕
				</button>
			</div>
		</div>
	);
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface AgentHistoryPanelProps {
	entries: AgentHistoryEntry[];
	onConnect: (agent: AgentSummary, password: string) => void;
	onRemove: (agentId: string) => void;
}

export function AgentHistoryPanel({ entries, onConnect, onRemove }: AgentHistoryPanelProps) {
	const { open, close } = useModal();
	const [connectingId, setConnectingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Mobile: tracks which row has its action buttons visible.
	const [activeId, setActiveId] = useState<string | null>(null);
	const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const DISMISS_TIMEOUT_MS = 3000;

	const activateRow = useCallback((agentId: string) => {
		if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
		setActiveId(agentId);
		dismissTimerRef.current = setTimeout(() => setActiveId(null), DISMISS_TIMEOUT_MS);
	}, []);

	// Clear timer on unmount.
	useEffect(() => {
		return () => {
			if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
		};
	}, []);

	async function handleConnect(agentId: string) {
		setError(null);
		setConnectingId(agentId);
		try {
			const agent = await agentApi.getAgent(agentId);
			open(
				<PasswordPrompt
					agentId={agent.agent_id}
					onSubmit={(password) => {
						close();
						onConnect(agent, password);
					}}
				/>,
				"22rem",
			);
		} catch {
			setError("Agent not found or unavailable.");
		} finally {
			setConnectingId(null);
		}
	}

	return (
		<aside className="flex flex-col h-full gap-3 p-4 bg-surface rounded-xl border border-border min-w-0">
			{/* Header */}
			<div className="flex items-center justify-between gap-2 shrink-0">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Agent History</h2>
				{entries.length > 0 && (
					<span className="text-xs font-mono text-muted">{entries.length}</span>
				)}
			</div>

			{/* Content */}
			{entries.length === 0 ? (
				<p className="text-xs text-muted text-center py-4">No previous agents.</p>
			) : (
				<div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0">
					{entries.map((entry) => (
						<HistoryRow
							key={entry.agent_id}
							entry={entry}
							connecting={connectingId === entry.agent_id}
							isActive={activeId === entry.agent_id}
							onActivate={() => activateRow(entry.agent_id)}
							onConnect={() => void handleConnect(entry.agent_id)}
							onRemove={() => onRemove(entry.agent_id)}
						/>
					))}
				</div>
			)}

			{error && <p className="text-xs text-error shrink-0">{error}</p>}
		</aside>
	);
}
