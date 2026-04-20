import { HeaderActions } from "@/components/HeaderActions";
import { AccessControlPanel } from "@/components/panels/AccessControlPanel";
import { AgentHistoryPanel } from "@/components/panels/AgentHistoryPanel";
import { ConnectToAgentForm } from "@/components/panels/ConnectToAgentForm";
import { ConnectedViewersList } from "@/components/panels/ConnectedViewersList";
import { DevicePanel } from "@/components/panels/DevicePanel";
import { useAgentHistory } from "@/hooks/panels/useAgentHistory";
import type { AgentSummary } from "@omni-view/shared";
import { useCallback } from "react";

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
				<div className="flex flex-col md:grid md:h-full md:grid-cols-[24rem_1fr] md:grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 md:gap-4 md:p-4">
					{/* ── Connect form — mobile: first; desktop: col-2 row-1 ─── */}
					<main className="order-first md:order-0 min-w-0 md:col-start-2 md:row-start-1 md:overflow-y-auto">
						<ConnectToAgentForm onConnect={handleConnect} />
					</main>

					{/* ── Left column: Device + Access — col-1, spans both rows ── */}
					<div className="flex flex-col gap-3 md:gap-4 md:col-start-1 md:row-start-1 md:row-span-2 md:overflow-y-auto">
						<DevicePanel />
						<div className="flex-1 min-h-0 overflow-y-auto">
							<AccessControlPanel />
						</div>
					</div>

					{/* ── Bottom row: History + Viewers — col-2 row-2 ────────── */}
					<div className="md:col-start-2 md:row-start-2 flex flex-col lg:flex-row gap-3 md:gap-4 md:overflow-hidden">
						<div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
							<AgentHistoryPanel
								entries={entries}
								onConnect={handleConnect}
								onRemove={removeEntry}
							/>
						</div>
						<div className="flex-1 min-w-0 flex flex-col">
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
