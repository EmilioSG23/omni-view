import type { AgentSummary } from "@omni-view/shared";
import { useCallback } from "react";
import { AccessControlPanel } from "../components/AccessControlPanel";
import { AgentHistoryPanel } from "../components/AgentHistoryPanel";
import { ConnectToAgentForm } from "../components/ConnectToAgentForm";
import { ConnectedViewersList } from "../components/ConnectedViewersList";
import { DevicePanel } from "../components/DevicePanel";
import { HeaderActions } from "../components/HeaderActions";
import { useAgentHistory } from "../hooks/useAgentHistory";

interface DirectoryPageProps {
	onConnect: (agent: AgentSummary, password: string) => void;
}

export function DirectoryPage({ onConnect }: DirectoryPageProps) {
	const { entries, addEntry, removeEntry } = useAgentHistory();

	const handleConnect = useCallback(
		(agent: AgentSummary, password: string) => {
			addEntry(agent);
			onConnect(agent, password);
		},
		[addEntry, onConnect],
	);

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* ─── Header ────────────────────────────────────────────────── */}
			<header className="border-b border-border flex items-center justify-between px-5 py-2 md:px-7 gap-4 shrink-0">
				<Wordmark />
				<HeaderActions />
			</header>

			<div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
				<div className="flex flex-col md:grid md:h-full md:grid-cols-[24rem_1fr] md:grid-rows-[auto_minmax(0,1fr)]">
					{/* ── Left column: Device + History (mobile only) + Access ── */}
					{/* Mobile: flows naturally; md+: col-1 spans both rows */}
					<div className="flex flex-col md:col-start-1 md:row-start-1 md:row-span-2 md:overflow-y-auto">
						<div className="p-2 md:p-5 shrink-0">
							<DevicePanel />
						</div>

						{/* Agent history — visible on mobile only (after DevicePanel) */}
						<div className="p-2 md:p-5 shrink-0 md:hidden">
							<AgentHistoryPanel
								entries={entries}
								onConnect={handleConnect}
								onRemove={removeEntry}
							/>
						</div>

						<div className="p-2 md:p-5 flex-1 min-h-0 overflow-y-auto">
							<AccessControlPanel />
						</div>
					</div>

					{/* ── Main (connect form) ────────────────────────────────── */}
					{/* Mobile: first; md+: col-2 row-1 */}
					<main className="order-first md:order-0 p-2 md:p-6 min-w-0 flex flex-col gap-5 md:col-start-2 md:row-start-1 md:overflow-y-auto">
						<ConnectToAgentForm onConnect={handleConnect} />
					</main>

					{/* ── Bottom row: Agent History + Viewers (md+) ─────────── */}
					{/* Mobile: hidden history here (shown above); Viewers shown normally */}
					{/* md+: col-2 row-2, split 50/50 */}
					<div className="md:col-start-2 md:row-start-2 flex flex-col lg:flex-row gap-3 p-2 md:p-5 md:overflow-hidden">
						{/* Agent history — hidden on mobile (rendered in left col instead) */}
						<div className="hidden md:flex flex-col flex-1 min-w-0 overflow-y-auto">
							<AgentHistoryPanel
								entries={entries}
								onConnect={handleConnect}
								onRemove={removeEntry}
							/>
						</div>

						{/* Viewers — always visible */}
						<div className="flex flex-col flex-1 min-w-0">
							<ConnectedViewersList />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function Wordmark() {
	return (
		<span className="font-mono font-semibold text-sm tracking-[0.08em] text-primary">
			OMNI<span className="text-accent">VIEW</span>
		</span>
	);
}
