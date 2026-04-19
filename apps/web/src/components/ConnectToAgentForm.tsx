import type { AgentSummary } from "@omni-view/shared";
import { type FormEvent, useState } from "react";
import { agentApi } from "../core/agent-api";
import { useModal } from "../hooks/useModal";

interface ConnectToAgentFormProps {
	onConnect: (agent: AgentSummary, password: string) => void;
}

/** Compact password prompt rendered inside the modal. */
function PasswordPrompt({
	agentId,
	onSubmit,
}: {
	agentId: string;
	onSubmit: (password: string) => void;
}) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!password) {
			setError("Password is required.");
			return;
		}
		setError(null);
		setLoading(true);
		try {
			onSubmit(password);
		} catch {
			setError("Failed to connect.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<div>
				<h3 className="text-sm font-semibold text-primary">Connect to Agent</h3>
				<p className="text-xs text-muted mt-0.5 font-mono truncate">{agentId}</p>
			</div>
			<div className="flex flex-col gap-1">
				<label className="text-xs text-muted" htmlFor="agent-password">
					Password
				</label>
				<input
					id="agent-password"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					autoFocus
					placeholder="Enter session password…"
					className="w-full px-3 py-2 rounded-lg bg-elevated border border-border focus:border-accent focus:outline-none text-sm font-mono text-primary placeholder:text-muted"
				/>
			</div>
			{error && <p className="text-error text-xs">{error}</p>}
			<button
				type="submit"
				disabled={loading}
				className="w-full py-2 rounded-lg bg-accent text-base font-semibold text-sm transition-opacity disabled:opacity-50"
			>
				{loading ? "Connecting…" : "Connect"}
			</button>
		</form>
	);
}

export function ConnectToAgentForm({ onConnect }: ConnectToAgentFormProps) {
	const { open, close } = useModal();
	const [agentId, setAgentId] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		const id = agentId.trim();
		if (!id) return;
		setError(null);
		setLoading(true);
		try {
			const agent = await agentApi.getAgent(id);
			// Show password modal
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
			setLoading(false);
		}
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-col gap-2 p-4 bg-surface rounded-xl border border-border"
		>
			<h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
				Connect to Agent
			</h2>
			<div className="flex gap-2">
				<input
					type="text"
					value={agentId}
					onChange={(e) => setAgentId(e.target.value)}
					placeholder="Paste Agent ID…"
					className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-elevated border border-border focus:border-accent focus:outline-none text-xs font-mono text-primary placeholder:text-muted"
				/>
				<button
					type="submit"
					disabled={loading || !agentId.trim()}
					className="px-4 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold transition-colors disabled:opacity-50"
				>
					{loading ? "…" : "Go"}
				</button>
			</div>
			{error && <p className="text-error text-xs">{error}</p>}
		</form>
	);
}
