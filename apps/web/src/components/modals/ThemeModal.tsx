import type { ThemeMeta } from "@/consts/styles";
import { useTheme } from "@/hooks/useTheme";

/* ─── Swatch strip ──────────────────────────────────────────────────────── */

function SwatchPreview({ theme }: { theme: ThemeMeta }) {
	const [bg, surface, accent, text] = theme.swatches;
	return (
		<div
			className="relative rounded-lg overflow-hidden border border-border h-24 w-full"
			style={{ background: bg }}
			aria-hidden="true"
		>
			{/* Simulated surface card */}
			<div
				className="absolute left-3 top-3 right-3 bottom-3 rounded-md border"
				style={{
					background: surface,
					borderColor: theme.isLight ? "#dde0ea" : "#252830",
				}}
			>
				{/* Simulated header bar */}
				<div
					className="h-5 rounded-t-md flex items-center px-2 gap-1"
					style={{
						background: theme.isLight ? "#e4e7f0" : "#1a1c1f",
					}}
				>
					{/* Accent dot */}
					<span className="inline-block h-2 w-2 rounded-full" style={{ background: accent }} />
					{/* Text line stubs */}
					<span
						className="inline-block h-1.5 rounded-full"
						style={{ background: text, opacity: 0.35, width: "40%" }}
					/>
				</div>
				{/* Body lines */}
				<div className="p-2 flex flex-col gap-1.5">
					<span
						className="block h-1.5 rounded-full"
						style={{ background: text, opacity: 0.55, width: "70%" }}
					/>
					<span
						className="block h-1.5 rounded-full"
						style={{ background: text, opacity: 0.35, width: "50%" }}
					/>
				</div>
			</div>
		</div>
	);
}

/* ─── Colour palette strip ──────────────────────────────────────────────── */

function PaletteStrip({ swatches, labels }: { swatches: string[]; labels: string[] }) {
	return (
		<div className="flex gap-1 mt-2">
			{swatches.map((color, i) => (
				<span
					key={i}
					title={labels[i]}
					className="h-3 flex-1 rounded-sm"
					style={{ background: color }}
				/>
			))}
		</div>
	);
}

/* ─── Theme card ─────────────────────────────────────────────────────────── */

const SWATCH_LABELS = ["Base", "Surface", "Accent", "Text"];

function ThemeCard({
	themeMeta,
	isActive,
	onSelect,
}: {
	themeMeta: ThemeMeta;
	isActive: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={[
				"group relative flex flex-col gap-2 p-3 rounded-xl border text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2",
				isActive
					? "border-accent bg-accent-dim ring-1 ring-accent"
					: "border-border hover:border-border-strong hover:bg-elevated",
			].join(" ")}
			aria-pressed={isActive}
			aria-label={`Select theme ${themeMeta.name}`}
		>
			{/* Active badge */}
			{isActive && (
				<span
					className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent"
					aria-hidden="true"
				/>
			)}

			{/* Mini-app preview */}
			<SwatchPreview theme={themeMeta} />

			{/* Name & description */}
			<div>
				<p className="text-sm font-medium text-primary leading-tight">{themeMeta.name}</p>
				<p className="text-xs text-muted mt-0.5 leading-tight">{themeMeta.description}</p>
			</div>

			{/* Colour palette */}
			<PaletteStrip swatches={themeMeta.swatches} labels={SWATCH_LABELS} />
		</button>
	);
}

/* ─── Modal content ──────────────────────────────────────────────────────── */

export function ThemeModal() {
	const { theme, setTheme, themes } = useTheme();

	function handleSelect(id: string) {
		setTheme(id);
	}

	return (
		<div>
			<div className="mb-5">
				<h2 className="text-[1rem] font-semibold text-primary">Interface theme</h2>
				<p className="text-sm text-muted mt-0.5">
					Choose the color scheme you prefer. The selection is saved automatically.
				</p>
			</div>

			<div
				className="grid gap-3 max-h-[60vh] overflow-y-auto px-1"
				style={{ gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))" }}
				role="group"
				aria-label="Available themes"
			>
				{themes.map((t) => (
					<ThemeCard
						key={t.id}
						themeMeta={t}
						isActive={theme === t.id}
						onSelect={() => handleSelect(t.id)}
					/>
				))}
			</div>
		</div>
	);
}
