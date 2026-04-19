import { useState } from "react";
import type { CaptureState } from "../context/DeviceContext";
import { useDevice } from "../context/DeviceContext";

function truncateId(id: string): string {
	return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

function CaptureStateBadge({ state }: { state: CaptureState }) {
	const config = {
		idle: { label: "Idle", className: "bg-overlay text-muted border-border" },
		requesting: { label: "Requesting…", className: "bg-overlay text-warn border-warn/40" },
		active: { label: "Live", className: "bg-success/10 text-success border-success/40" },
		error: { label: "Error", className: "bg-error/10 text-error border-error/40" },
	}[state];
	return (
		<span
			className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-mono ${config.className}`}
		>
			{state === "active" && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
			{config.label}
		</span>
	);
}

export function DevicePanel() {
	const {
		agentId,
		isRegistered,
		password,
		setPassword,
		savePassword,
		captureState,
		startCapture,
		stopCapture,
	} = useDevice();

	const [copied, setCopied] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	async function handleCopy() {
		await navigator.clipboard.writeText(agentId);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	async function handleSavePassword() {
		setSaving(true);
		setSaveError(null);
		try {
			await savePassword();
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setSaving(false);
		}
	}

	const canCapture = isRegistered && typeof navigator.mediaDevices?.getDisplayMedia === "function";
	const isCapturing = captureState === "active";

	return (
		<aside className="flex flex-col gap-4 p-4 bg-surface rounded-xl border border-border min-w-0">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted">This Device</h2>
				{isRegistered ? (
					<span className="text-xs text-success font-mono">Registered</span>
				) : (
					<span className="text-xs text-warn font-mono">Connecting…</span>
				)}
			</div>

			{/* Agent ID */}
			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted">Agent ID</span>
				<button
					type="button"
					onClick={handleCopy}
					title="Click to copy"
					className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-elevated hover:bg-overlay transition-colors text-left group"
				>
					<span className="font-mono text-xs text-primary truncate flex-1">
						{truncateId(agentId)}
					</span>
					<span className="text-muted group-hover:text-accent text-xs shrink-0">
						{copied ? "✓" : "⎘"}
					</span>
				</button>
			</div>

			{/* Password */}
			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted">Session Password</span>
				<div className="flex gap-2">
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="Set a password…"
						className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-elevated border border-border focus:border-accent focus:outline-none text-xs font-mono text-primary placeholder:text-muted"
					/>
					<button
						type="button"
						onClick={handleSavePassword}
						disabled={saving}
						className="px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-medium transition-colors disabled:opacity-50"
					>
						{saving ? "…" : "Save"}
					</button>
				</div>
				{saveError && <p className="text-error text-xs">{saveError}</p>}
			</div>

			{/* Capture status + controls */}
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<span className="text-xs text-muted">Capture</span>
					<CaptureStateBadge state={captureState} />
				</div>
				<button
					type="button"
					onClick={isCapturing ? stopCapture : startCapture}
					disabled={!canCapture || captureState === "requesting"}
					className={[
						"w-full py-2 rounded-lg text-xs font-semibold transition-colors",
						isCapturing
							? "bg-error/10 hover:bg-error/20 text-error border border-error/30"
							: "bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30",
						(!canCapture || captureState === "requesting") && "opacity-50 cursor-not-allowed",
					]
						.filter(Boolean)
						.join(" ")}
				>
					{isCapturing
						? "Stop Sharing"
						: captureState === "requesting"
							? "Requesting…"
							: captureState === "error"
								? "Retry Capture"
								: "Share Screen"}
				</button>
				{!canCapture && (
					<p className="text-warn text-xs text-center">
						Requires HTTPS or localhost — not available over plain HTTP.
					</p>
				)}
			</div>
		</aside>
	);
}
