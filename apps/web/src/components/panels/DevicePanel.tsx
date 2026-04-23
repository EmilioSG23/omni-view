import { Modal } from "@/components/Modal";
import { CaptureSettingsPanel } from "@/components/panels/CaptureSettingsPanel";
import type { CaptureState } from "@/context/DeviceContext";
import { useDevice } from "@/context/DeviceContext";
import { EyeIcon } from "@/icons/EyeIcon";
import { EyeOffIcon } from "@/icons/EyeOffIcon";
import { RefreshIcon } from "@/icons/RefreshIcon";
import { AGENT_PASSWORD_MAX_LENGTH, generateAgentPassword } from "@omni-view/shared";
import { useState } from "react";

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
		captureSettings,
		saveCaptureSettings,
		captureState,
		startCapture,
		stopCapture,
		inputPermissions,
		allInputsEnabled,
		toggleInputFeature,
		toggleAllInputs,
		lastRemoteInput,
	} = useDevice();

	const [copied, setCopied] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [showPassword, setShowPassword] = useState(false);
	const [showSettings, setShowSettings] = useState(false);

	async function handleRegenerate() {
		setSaving(true);
		setSaveError(null);
		try {
			const newPw = generateAgentPassword(AGENT_PASSWORD_MAX_LENGTH);
			setPassword(newPw);
			await savePassword(newPw);
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "Failed to regenerate");
		} finally {
			setSaving(false);
		}
	}

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

	const hasWindow = typeof window !== "undefined";
	const isSecureContext = hasWindow && !!window.isSecureContext;
	const hasMediaDevices = typeof navigator !== "undefined" && !!navigator.mediaDevices;
	const hasGetDisplayMedia =
		typeof navigator !== "undefined" &&
		typeof navigator.mediaDevices?.getDisplayMedia === "function";
	const canCapture = isRegistered && hasGetDisplayMedia;
	const isCapturing = captureState === "active";

	const lastRemoteInputLabel = lastRemoteInput
		? `${lastRemoteInput.viewerId.slice(0, 8)} · ${lastRemoteInput.event.type}`
		: null;

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
					<span className="font-mono text-xs text-primary truncate flex-1">{agentId}</span>
					<span className="text-muted group-hover:text-accent text-xs shrink-0">
						{copied ? "✓" : "⎘"}
					</span>
				</button>
			</div>

			{/* Password */}
			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted">Session Password</span>
				<div className="flex gap-2 items-center">
					<div className="relative flex-1 min-w-0">
						<input
							type={showPassword ? "text" : "password"}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							maxLength={AGENT_PASSWORD_MAX_LENGTH}
							placeholder="Set a password…"
							className="w-full flex-1 min-w-0 px-3 pr-10 py-1.5 rounded-lg bg-elevated border border-border focus:border-accent focus:outline-none text-xs font-mono text-primary placeholder:text-muted"
						/>
						<button
							type="button"
							onClick={() => setShowPassword((s) => !s)}
							aria-label={showPassword ? "Hide password" : "Show password"}
							title={showPassword ? "Hide password" : "Show password"}
							className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center px-2 py-1.5 rounded-md bg-transparent hover:bg-overlay text-muted text-xs transition-colors focus:outline-none"
						>
							{showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
						</button>
					</div>
					<button
						type="button"
						onClick={handleRegenerate}
						disabled={saving}
						title="Regenerate password"
						className="group px-2 py-1.5 rounded-lg bg-elevated border border-border hover:bg-overlay text-muted text-xs font-medium transition-colors"
					>
						<RefreshIcon className="w-4 h-4 group-hover:-rotate-90 transition" />
					</button>
					<button
						type="button"
						onClick={handleSavePassword}
						disabled={saving}
						className="px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-medium transition-colors disabled:opacity-50"
					>
						Save
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
				<div className="flex gap-2">
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
					<button
						className="p-2 rounded-lg text-xs font-semibold transition-colors
					bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30
					disabled:opacity-50 disabled:cursor-not-allowed"
						onClick={() => setShowSettings(true)}
						title="Capture settings"
						disabled={!canCapture || captureState === "requesting"}
					>
						⚙
					</button>
				</div>
				{!canCapture && (
					<div className="text-warn text-xs text-center">
						{!isSecureContext ? (
							<p>Requires HTTPS or localhost — secure context required.</p>
						) : !hasMediaDevices ? (
							<p>
								Your browser does not expose{" "}
								<span className="font-mono">navigator.mediaDevices</span>. Screen capture
								unavailable.
							</p>
						) : !hasGetDisplayMedia ? (
							<p>
								This browser doesn't support screen capture (
								<span className="font-mono">getDisplayMedia</span>). Try Chrome on Android or
								desktop Chrome/Edge.
							</p>
						) : (
							<p>
								Screen capture unavailable — check browser permissions or try a different browser.
							</p>
						)}
					</div>
				)}
			</div>

			{showSettings && (
				<Modal onClose={() => setShowSettings(false)} width="22rem">
					<CaptureSettingsPanel
						settings={captureSettings}
						onSave={saveCaptureSettings}
						inputPermissions={inputPermissions}
						allInputsEnabled={allInputsEnabled}
						toggleInputFeature={toggleInputFeature}
						toggleAllInputs={toggleAllInputs}
					/>
				</Modal>
			)}
		</aside>
	);
}
