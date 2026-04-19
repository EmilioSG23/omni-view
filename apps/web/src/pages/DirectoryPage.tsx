import type { AgentSummary } from "@omni-view/shared";
import { ConnectToAgentForm } from "../components/ConnectToAgentForm";
import { ConnectedViewersList } from "../components/ConnectedViewersList";
import { DevicePanel } from "../components/DevicePanel";

interface DirectoryPageProps {
	onConnect: (agent: AgentSummary, password: string) => void;
}

export function DirectoryPage({ onConnect }: DirectoryPageProps) {
	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* ─── Header ────────────────────────────────────────────────── */}
			<header className="border-b border-border flex items-center px-5 py-2 lg:px-7 gap-4 shrink-0">
				<Wordmark />
			</header>

			{/* ─── Body: responsive 3-column layout ─────────────────────── */}
			{/* Mobile (<lg): single scrollable column stack */}
			{/* lg+: three fixed-height side-by-side columns */}
			<div className="flex-1 overflow-y-auto lg:overflow-hidden lg:flex lg:flex-row">
				{/* LEFT — Device Panel */}
				<aside className="p-4 lg:p-5 border-b lg:border-b-0 lg:border-r border-border lg:w-68 lg:shrink-0 lg:overflow-y-auto">
					<DevicePanel />
				</aside>

				{/* CENTER — Connect form only */}
				<main className="flex-1 min-w-0 p-4 lg:p-6 flex flex-col gap-5 lg:overflow-y-auto">
					<ConnectToAgentForm onConnect={onConnect} />
				</main>

				{/* RIGHT — Connected Viewers */}
				<aside className="p-4 lg:p-5 border-t lg:border-t-0 lg:border-l border-border lg:w-56 lg:shrink-0 lg:overflow-y-auto">
					<ConnectedViewersList />
				</aside>
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
