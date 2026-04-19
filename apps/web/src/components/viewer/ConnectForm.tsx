// ─── Connect form with whitelist status ──────────────────────────────────────

import { AgentSummary } from "@omni-view/shared";
import { useState } from "react";
import { useWhitelistCheck } from "../../hooks/useWhitelistCheck";

interface ConnectFormProps {
	agent: AgentSummary;
	onSubmit: (wsUrl: string, password: string) => void;
}

export function ConnectForm({ agent, onSubmit }: ConnectFormProps) {
	const [wsUrl, setWsUrl] = useState(agent.ws_url ?? "");
	const [password, setPassword] = useState("");
	const { status, deviceId, error: wlError, request } = useWhitelistCheck(agent.agent_id);
	const [copyLabel, setCopyLabel] = useState("copy");

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!wsUrl.trim()) return;
		onSubmit(wsUrl.trim(), password);
	}

	async function copyDeviceId() {
		try {
			await navigator.clipboard.writeText(deviceId);
			setCopyLabel("copied!");
			setTimeout(() => setCopyLabel("copy"), 2000);
		} catch {
			/* clipboard unavailable */
		}
	}

	const wlBorderClass =
		status === "allowed"
			? "border-success"
			: status === "denied" || status === "blacklisted"
				? "border-error"
				: status === "pending"
					? "border-accent"
					: "border-border";

	return (
		<form
			onSubmit={handleSubmit}
			aria-label={`Connect to ${agent.label ?? agent.agent_id}`}
			className="flex flex-col gap-4 w-full max-w-100"
		>
			<h2 className="font-mono text-xs text-secondary tracking-widest uppercase mb-2">
				Connect to <span className="text-accent">{agent.label ?? agent.agent_id}</span>
			</h2>

			{/* Device identity + whitelist status */}
			<div className={`p-3 bg-elevated rounded border ${wlBorderClass} flex flex-col gap-2`}>
				<div className="flex items-center gap-2 flex-wrap">
					<span className="font-mono text-xs text-muted shrink-0">YOUR DEVICE</span>
					<span
						className="font-mono text-xs text-secondary overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0"
						title={deviceId}
					>
						{deviceId.slice(0, 8)}…{deviceId.slice(-4)}
					</span>
					<button
						type="button"
						onClick={copyDeviceId}
						className="text-xs font-mono text-accent px-2 py-px border border-accent-dim bg-accent-dim rounded-sm shrink-0 cursor-pointer"
					>
						{copyLabel}
					</button>
				</div>
				<div className="flex items-center gap-2">
					{status === "checking" && (
						<span className="text-xs text-muted font-mono">checking access…</span>
					)}
					{status === "allowed" && (
						<span className="text-xs text-success font-mono">✓ device authorized</span>
					)}
					{status === "pending" && (
						<span className="text-xs text-accent font-mono flex items-center gap-1.5">
							<svg
								aria-hidden="true"
								className="inline-block w-3 h-3 animate-spin shrink-0"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
							>
								<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
							</svg>
							waiting for host approval…
						</span>
					)}
					{status === "blacklisted" && (
						<span className="text-xs text-error font-mono">⊘ device blocked by host</span>
					)}
					{status === "error" && (
						<span className="text-xs text-warn font-mono">
							⚠ {wlError ?? "whitelist unavailable"}
						</span>
					)}
					{status === "denied" && (
						<>
							<span className="text-xs text-error font-mono">✗ not authorized</span>
							<button
								type="button"
								onClick={() => request("Web Client")}
								className="ml-auto text-xs font-mono text-accent px-3 py-0.5 border border-border-strong rounded bg-overlay cursor-pointer"
							>
								request access
							</button>
						</>
					)}
				</div>
			</div>

			<label className="flex flex-col gap-1">
				<span className="text-xs font-mono text-muted tracking-[0.08em] uppercase">
					WebSocket URL
				</span>
				<input
					type="url"
					value={wsUrl}
					onChange={(e) => setWsUrl(e.target.value)}
					placeholder="ws://192.168.1.x:9000"
					required
					aria-required="true"
					className="h-9 px-3 bg-elevated border border-border-strong rounded text-primary font-mono text-sm outline-none w-full focus:border-accent"
				/>
			</label>

			<label className="flex flex-col gap-1">
				<span className="text-xs font-mono text-muted tracking-[0.08em] uppercase">Password</span>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="enter agent password"
					autoComplete="current-password"
					className="h-9 px-3 bg-elevated border border-border-strong rounded text-primary font-mono text-sm outline-none w-full focus:border-accent"
				/>
			</label>

			<button
				type="submit"
				disabled={status === "pending" || status === "blacklisted"}
				className="h-9 bg-accent text-inverse font-semibold text-sm rounded tracking-[0.04em] cursor-pointer hover:opacity-85 transition-opacity duration-120 disabled:opacity-40 disabled:cursor-not-allowed"
			>
				Connect
			</button>
		</form>
	);
}
