import { QUALITY_PRESETS, QualityPreset } from "@omni-view/shared";

// ─── Quality preset bar ───────────────────────────────────────────────────────
const PRESET_LABELS: Partial<Record<QualityPreset, string>> = {
	performance: "PERF",
	balanced: "BAL",
	quality: "HQ",
};

interface QualityBarProps {
	activePreset: QualityPreset | null;
	onSelect: (preset: QualityPreset) => void;
}

export function QualityBar({ activePreset, onSelect }: QualityBarProps) {
	const presets = Object.keys(QUALITY_PRESETS) as Exclude<QualityPreset, "custom">[];
	return (
		<div className="flex items-center gap-1" role="group" aria-label="Stream quality">
			{/* Hide full label on small screens to save horizontal space */}
			<span className="text-xs font-mono text-muted mr-1 hidden sm:inline">QUALITY</span>
			{presets.map((preset) => {
				const active = activePreset === preset;
				return (
					<button
						key={preset}
						onClick={() => onSelect(preset)}
						aria-pressed={active}
						aria-label={`Set quality to ${preset}`}
						className={`h-6 px-1 sm:px-2 font-mono text-xs tracking-[0.04em] border rounded-sm cursor-pointer transition-all duration-120 ${
							active
								? "border-accent bg-accent-dim text-accent"
								: "border-border bg-transparent text-secondary"
						}`}
					>
						{PRESET_LABELS[preset] ?? preset}
					</button>
				);
			})}
		</div>
	);
}
