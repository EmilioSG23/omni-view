import type { AgentSummary } from "@omni-view/shared";
import { useEffect, useRef, useState } from "react";
import { AgentCard } from "../components/AgentCard";
import { ConnectToAgentForm } from "../components/ConnectToAgentForm";
import { ConnectedViewersList } from "../components/ConnectedViewersList";
import { DevicePanel } from "../components/DevicePanel";
import { agentApi } from "../core/agent-api";

interface DirectoryPageProps {
	onConnect: (agent: AgentSummary, password: string) => void;
}

export function DirectoryPage({ onConnect }: DirectoryPageProps) {
	const [agents, setAgents] = useState<AgentSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	async function load() {
		try {
			const list = await agentApi.listAgents();
			setAgents(list);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load agents");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void load();
		intervalRef.current = setInterval(() => void load(), 10_000);
		return () => {
			if (intervalRef.current !== null) clearInterval(intervalRef.current);
		};
	}, []);

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* Header */}
			<header className="h-header border-b border-border flex items-center px-6 gap-4 shrink-0">
				<Wordmark />
				<span className="flex-1" />
				<button
					type="button"
					onClick={() => void load()}
					className="h-7.5 px-4 rounded border border-border text-secondary text-xs font-mono bg-transparent hover:border-border-strong hover:text-primary transition-[border-color,color] duration-120 cursor-pointer"
				>
					↻ refresh
				</button>
			</header>

			{/* 3-column body */}
			<div className="flex flex-1 overflow-hidden gap-4 p-4">
				{/* Left — Device panel + connected viewers */}
				<div className="w-56 shrink-0 flex flex-col gap-4 overflow-y-auto">
					<DevicePanel />
					<ConnectedViewersList />
				</div>

				{/* Center — agent grid */}
				<main className="flex-1 overflow-y-auto flex flex-col gap-4 min-w-0">
					<ConnectToAgentForm onConnect={onConnect} />

					<div>
						<h1 className="text-xs font-mono text-muted tracking-[0.12em] uppercase mb-3">
							All Agents
							<span className="ml-3 inline-block bg-elevated border border-border rounded-sm px-1.5">
								{loading ? "…" : agents.length}
							</span>
						</h1>

						{loading && <p className="text-muted text-sm font-mono">Loading…</p>}

						{!loading && error && (
							<div className="bg-error/5 border border-error/30 rounded-lg p-4 text-error text-sm font-mono">
								{error}
							</div>
						)}

						{!loading && !error && agents.length === 0 && (
							<div className="flex flex-col items-center justify-center pt-12 gap-3">
								<span className="text-3xl opacity-25">◎</span>
								<p className="text-muted text-sm">No agents registered</p>
							</div>
						)}

						{!loading && agents.length > 0 && (
							<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
								{agents.map((a) => (
									<AgentCard
										key={a.agent_id}
										agent={a}
										onConnect={(agent) => onConnect(agent, "")}
									/>
								))}
							</div>
						)}
					</div>
				</main>
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
