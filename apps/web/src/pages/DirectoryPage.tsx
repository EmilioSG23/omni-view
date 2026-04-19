import type { AgentSummary } from "@omni-view/shared";
import { ConnectToAgentForm } from "../components/ConnectToAgentForm";
import { ConnectedViewersList } from "../components/ConnectedViewersList";
import { DevicePanel } from "../components/DevicePanel";
import { HeaderActions } from "../components/HeaderActions";

interface DirectoryPageProps {
	onConnect: (agent: AgentSummary, password: string) => void;
}

export function DirectoryPage({ onConnect }: DirectoryPageProps) {
	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* ─── Header ────────────────────────────────────────────────── */}
			<header className="border-b border-border flex items-center justify-between px-5 py-2 md:px-7 gap-4 shrink-0">
				<Wordmark />
				<HeaderActions />
			</header>

			<div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
				<div className="flex flex-col md:grid md:h-full md:grid-cols-[24rem_1fr] md:grid-rows-[auto_minmax(0,1fr)] 2xl:grid-cols-[24rem_1fr_24rem] 2xl:grid-rows-1">
					{/* 1 — Connect form: mobile top, md col-2 row-1, 2xl col-2 */}
					<main className="p-4 md:p-6 min-w-0 flex flex-col gap-5 md:col-start-2 md:row-start-1 md:overflow-y-auto">
						<ConnectToAgentForm onConnect={onConnect} />
					</main>

					{/* 2 — Device panel: mobile middle, md col-1 rows 1-2, 2xl col-1 row-1 */}
					<aside className="p-4 md:p-5 border-b md:border-b-0 md:border-r border-border md:col-start-1 md:row-start-1 md:row-span-2 2xl:row-span-1 md:shrink-0 md:overflow-y-auto">
						<DevicePanel />
					</aside>

					{/* 3 — Viewers: mobile bottom, md col-2 row-2, 2xl col-3 row-1 */}
					<section className="p-4 md:p-5 border-t md:border-t-0 2xl:border-l border-border md:col-start-2 md:row-start-2 2xl:col-start-3 2xl:row-start-1 md:overflow-y-auto">
						<ConnectedViewersList />
					</section>
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
