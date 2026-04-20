import { type FormEvent, useState } from "react";

interface PasswordPromptProps {
	agentId: string;
	onSubmit: (password: string) => void;
}

/** Compact password prompt rendered inside a modal to connect to an agent. */
export function PasswordPrompt({ agentId, onSubmit }: PasswordPromptProps) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!password) {
			setError("Password is required.");
			return;
		}
		setError(null);
		setLoading(true);
		try {
			onSubmit(password);
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
