// ─── Capture settings panel ───────────────────────────────────────────────────
// Modal content for configuring screen-capture quality preset and audio.

import type { CaptureSettings, QualityPreset } from "@omni-view/shared";
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
	onClose: () => void;
}

export function CaptureSettingsPanel({ settings, onSave, onClose }: CaptureSettingsPanelProps) {
	const [local, setLocal] = useState<CaptureSettings>(settings);
	const presets = Object.keys(QUALITY_PRESETS) as NonCustomPreset[];

	function handlePresetChange(preset: NonCustomPreset) {
		setLocal((prev) => ({ ...prev, preset, fps: QUALITY_PRESETS[preset].fps }));
	}

	function handleApply() {
		onSave(local);
		onClose();
	}

	return (
		<div className="flex flex-col gap-5">
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
			</div>

			{/* System audio toggle */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="text-xs font-medium text-primary">System Audio</span>
					<span className="text-xs text-muted">
						Capture desktop audio (browser support may vary)
					</span>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={local.audio}
					onClick={() => setLocal((prev) => ({ ...prev, audio: !prev.audio }))}
					className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
						local.audio ? "bg-accent" : "bg-overlay"
					}`}
				>
					<span
						className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
							local.audio ? "translate-x-4" : "translate-x-0"
						}`}
					/>
				</button>
			</div>

			{/* FPS indicator */}
			<p className="text-xs text-muted text-center">
				Target frame rate: <span className="text-primary font-mono">{local.fps} fps</span>
			</p>

			{/* Action buttons */}
			<div className="flex gap-2 pt-1">
				<button
					type="button"
					onClick={onClose}
					className="flex-1 py-2 rounded-lg bg-elevated hover:bg-overlay text-sm text-secondary transition-colors border border-border"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={handleApply}
					className="flex-1 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-sm font-semibold transition-colors border border-accent/30"
				>
					Apply
				</button>
			</div>
		</div>
	);
}
