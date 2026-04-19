import type { AgentSummary } from "@omni-view/shared";
import { useEffect, useState } from "react";
import { agentApi } from "../core/agent-api";
import { StatusDot } from "./StatusDot";

interface AgentCardProps {
	agent: AgentSummary;
	onConnect: (agent: AgentSummary) => void;
}

function formatAge(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const s = Math.floor(diff / 1000);
	if (s < 60) return "just now";
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

export function AgentCard({ agent, onConnect }: AgentCardProps) {
	const [online, setOnline] = useState(false);

	useEffect(() => {
		let cancelled = false;
		agentApi
			.getStatus(agent.agent_id)
			.then((res) => {
				if (!cancelled) setOnline(res.connected);
			})
			.catch(() => {
				/* leave as offline */
			});
		return () => {
			cancelled = true;
		};
	}, [agent.agent_id]);

	return (
		<article
			className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-accent/40 hover:shadow-[0_0_0_1px_var(--accent-glow),0_2px_8px_rgba(0,0,0,0.4)]"
			onClick={() => onConnect(agent)}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onConnect(agent);
			}}
			aria-label={`Connect to ${agent.label ?? agent.agent_id}`}
		>
			{/* Header row */}
			<div className="flex items-center gap-2.5">
				<StatusDot state={online ? "online" : "offline"} size={8} />
				<span className="font-semibold text-sm flex-1 truncate text-primary">
					{agent.label ?? agent.agent_id}
				</span>
				<span className="font-mono text-[10px] text-muted bg-elevated border border-border rounded px-1.5 py-0.5 shrink-0">
					v{agent.version}
				</span>
			</div>

			{/* ID */}
			<p className="font-mono text-[11px] text-muted truncate">{agent.agent_id}</p>

			{/* Footer row */}
			<div className="flex items-center justify-between pt-2.5 border-t border-border gap-2">
				<span className="text-[11px] text-muted truncate">{agent.ws_url ?? "—"}</span>
				<span className="text-[11px] text-muted shrink-0">{formatAge(agent.last_seen_at)}</span>
			</div>
		</article>
	);
}
