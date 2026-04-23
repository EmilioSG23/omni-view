// ─── Capture settings panel ───────────────────────────────────────────────────
// Modal content for configuring screen-capture quality preset and audio.

import { controlCards } from "@/consts/inputs-control";
import type {
	CaptureSettings,
	QualityPreset,
	RemoteInputFeature,
	RemoteInputPermissions,
} from "@omni-view/shared";
import { QUALITY_PRESETS } from "@omni-view/shared";
import { useState } from "react";

type NonCustomPreset = Exclude<QualityPreset, "custom">;

const PRESET_LABELS: Record<NonCustomPreset, { label: string; desc: string }> = {
	performance: {
		label: "Performance",
		desc: `${QUALITY_PRESETS.performance.fps} fps · Lower quality`,
	},
	balanced: {
		label: "Balanced",
		desc: `${QUALITY_PRESETS.balanced.fps} fps · Recommended`,
	},
	quality: {
		label: "Quality",
		desc: `${QUALITY_PRESETS.quality.fps} fps · Best visual`,
	},
};

interface CaptureSettingsPanelProps {
	settings: CaptureSettings;
	onSave: (settings: CaptureSettings) => void;
	inputPermissions: RemoteInputPermissions;
	allInputsEnabled: boolean;
	toggleInputFeature: (feature: RemoteInputFeature) => void;
	toggleAllInputs: () => void;
}

export function CaptureSettingsPanel({
	settings,
	onSave,
	inputPermissions,
	allInputsEnabled,
	toggleInputFeature,
	toggleAllInputs,
}: CaptureSettingsPanelProps) {
	const [local, setLocal] = useState<CaptureSettings>(settings);
	const presets = Object.keys(QUALITY_PRESETS) as NonCustomPreset[];

	function handlePresetChange(preset: NonCustomPreset) {
		setLocal((prev) => {
			const next = { ...prev, preset, fps: QUALITY_PRESETS[preset].fps };
			onSave(next);
			return next;
		});
	}

	return (
		<div className="flex flex-col gap-3">
			<h2 className="text-sm font-semibold text-primary">Capture Settings</h2>

			{/* Quality preset */}
			<div className="flex flex-col gap-2">
				<span className="text-xs font-medium text-muted uppercase tracking-wider">
					Quality Preset
				</span>
				<div className="flex flex-col gap-1.5">
					{presets.map((preset) => {
						const { label, desc } = PRESET_LABELS[preset];
						const active = local.preset === preset;
						return (
							<button
								key={preset}
								type="button"
								onClick={() => handlePresetChange(preset)}
								className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
									active
										? "border-accent bg-accent/10 text-accent"
										: "border-border bg-elevated hover:bg-overlay text-primary"
								}`}
							>
								<span className="font-medium">{label}</span>
								<span className={`text-xs ${active ? "text-accent/70" : "text-muted"}`}>
									{desc}
								</span>
							</button>
						);
					})}
				</div>
				{/* FPS indicator */}
				<p className="text-xs text-muted text-center">
					Target frame rate: <span className="text-primary font-mono">{local.fps} fps</span>
				</p>
			</div>

			{/* Input controls */}
			<div className="flex flex-col gap-2">
				<div className="w-full flex items-center justify-between">
					<div className="w-2/3">
						<span className="text-xs text-muted">Remote inputs</span>
						<p className="mt-1 text-[10px] text-muted/80">
							Host policy is pushed live to connected viewers over the control channel.
						</p>
					</div>
					<button
						type="button"
						onClick={toggleAllInputs}
						disabled={
							!allInputsEnabled &&
							controlCards
								.filter(({ available }) => available)
								.every(({ feature }) => inputPermissions[feature])
						}
						className={[
							"rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
							allInputsEnabled
								? "border-accent/40 bg-accent/15 text-accent"
								: "border-border bg-elevated text-primary hover:border-accent/30 hover:text-accent",
						].join(" ")}
					>
						{allInputsEnabled ? "Restore" : "Enable all"}
					</button>
				</div>

				<div className="flex w-full items-center justify-center gap-2">
					{controlCards
						.filter(({ available }) => available)
						.map(({ feature, title, description, Icon, available }) => {
							const active = inputPermissions[feature];
							return (
								<button
									key={feature}
									type="button"
									onClick={() => toggleInputFeature(feature)}
									disabled={!available}
									className={[
										"group flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-3 text-left transition-all duration-150",
										active
											? "border-accent/50 bg-accent/12 text-primary shadow-[0_10px_30px_-18px_rgba(14,165,233,0.9)]"
											: "border-border/80 bg-base/60 text-muted hover:border-accent/30 hover:text-primary",
										"disabled:pointer-events-none disabled:opacity-50",
									].join(" ")}
									title={`Allow ${title}:\n${description}`}
								>
									<Icon className="h-4 w-4" />
								</button>
							);
						})}
				</div>

				{!settings.audio && (
					<p className="text-[11px] leading-4 text-muted/80">
						Audio can be muted live here, but enabling it during capture still requires audio to be
						included in capture settings first.
					</p>
				)}
			</div>
		</div>
	);
}
