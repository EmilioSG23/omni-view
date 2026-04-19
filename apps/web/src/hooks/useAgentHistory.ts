import type { AgentSummary } from "@omni-view/shared";
import { useCallback, useState } from "react";

const HISTORY_STORAGE_KEY = "omni-view:agent-history";
const MAX_HISTORY_ENTRIES = 20;

export interface AgentHistoryEntry {
	agent_id: string;
	label?: string | null;
	ws_url?: string | null;
	capture_mode?: string | null;
	version: string;
	/** ISO 8601 timestamp of the last successful connection. */
	last_connected_at: string;
}

function loadHistory(): AgentHistoryEntry[] {
	try {
		const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as AgentHistoryEntry[]) : [];
	} catch {
		return [];
	}
}

function persistHistory(entries: AgentHistoryEntry[]): void {
	try {
		localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
	} catch {
		// Storage unavailable — best effort.
	}
}

export function useAgentHistory() {
	const [entries, setEntries] = useState<AgentHistoryEntry[]>(loadHistory);

	const addEntry = useCallback((agent: AgentSummary) => {
		setEntries((prev) => {
			const now = new Date().toISOString();
			let next: AgentHistoryEntry[];

			if (prev.some((e) => e.agent_id === agent.agent_id)) {
				next = prev.map((e) =>
					e.agent_id === agent.agent_id
						? {
								...e,
								label: agent.label ?? null,
								ws_url: agent.ws_url ?? null,
								capture_mode: agent.capture_mode ?? null,
								version: agent.version,
								last_connected_at: now,
							}
						: e,
				);
			} else {
				const entry: AgentHistoryEntry = {
					agent_id: agent.agent_id,
					label: agent.label ?? null,
					ws_url: agent.ws_url ?? null,
					capture_mode: agent.capture_mode ?? null,
					version: agent.version,
					last_connected_at: now,
				};
				next = [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES);
			}

			// Keep sorted by most recent first.
			next.sort(
				(a, b) => new Date(b.last_connected_at).getTime() - new Date(a.last_connected_at).getTime(),
			);
			persistHistory(next);
			return next;
		});
	}, []);

	const removeEntry = useCallback((agentId: string) => {
		setEntries((prev) => {
			const next = prev.filter((e) => e.agent_id !== agentId);
			persistHistory(next);
			return next;
		});
	}, []);

	return { entries, addEntry, removeEntry };
}
