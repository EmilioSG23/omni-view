import { PasswordPrompt } from "@/components/PasswordPrompt";
import { useModal } from "@/hooks/useModal";
import { agentApi } from "@/services/agent-api";
import { DEVICE_ID_LENGTH, type AgentSummary } from "@omni-view/shared";
import { useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from "react";

interface ConnectToAgentFormProps {
	onConnect: (agent: AgentSummary, password: string) => void;
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
			className="flex flex-col gap-3 p-4 lg:p-5 bg-surface rounded-xl border border-border"
		>
			<h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
				Connect to Agent
			</h2>
			<div className="flex gap-2">
				<input
					type="tel"
					inputMode="numeric"
					pattern="[0-9]*"
					maxLength={DEVICE_ID_LENGTH}
					value={agentId}
					onChange={(e: ChangeEvent<HTMLInputElement>) => {
						const digits = e.target.value.replace(/\D/g, "");
						setAgentId(digits);
					}}
					onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
						e.preventDefault();
						const paste = e.clipboardData?.getData("text") ?? "";
						const digits = paste.replace(/\D/g, "");
						if (digits) setAgentId((prev) => (prev + digits).slice(0, DEVICE_ID_LENGTH));
					}}
					placeholder="Paste Agent ID…"
					className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-elevated border border-border focus:border-accent focus:outline-none text-sm font-mono text-primary placeholder:text-muted"
				/>
				<button
					type="submit"
					disabled={loading || !agentId.trim()}
					className="px-5 py-2.5 rounded-lg bg-accent/10 hover:bg-accent/20 active:bg-accent/30 text-accent text-sm font-semibold transition-colors disabled:opacity-40"
				>
					{loading ? "…" : "Go"}
				</button>
			</div>
			{error && <p className="text-error text-xs mt-0.5">{error}</p>}
		</form>
	);
}
