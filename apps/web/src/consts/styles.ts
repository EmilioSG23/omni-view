/** localStorage key for the persisted theme ID. */
export const THEME_KEY = "omniview:theme" as const;

/** The default theme applied when no stored preference exists. */
export const DEFAULT_THEME_ID = "nocturno" as const;

export interface ThemeMeta {
	/** Unique identifier — maps to the CSS `data-theme` attribute value. */
	id: string;
	/** Human-readable name displayed in the theme picker. */
	name: string;
	/** Short tagline shown under the name. */
	description: string;
	/** Whether the theme has a light background (used to style text contrast inside cards). */
	isLight: boolean;
	/**
	 * Representative swatches shown in the preview card.
	 * Order: [bg-base, bg-surface, accent, text-primary]
	 */
	swatches: [string, string, string, string];
}

export const THEMES: ThemeMeta[] = [
	{
		id: "nocturno",
		name: "Night",
		description: "Deep dark with an amber accent.",
		isLight: false,
		swatches: ["#0c0d0f", "#131416", "#f59e0b", "#e2e4e9"],
	},
	{
		id: "claro",
		name: "Light",
		description: "High-contrast with an electric blue accent.",
		isLight: true,
		swatches: ["#f8f9fc", "#ffffff", "#2563eb", "#0f1724"],
	},
	{
		id: "solar",
		name: "Solar",
		description: "Warm amber with orange highlights.",
		isLight: false,
		swatches: ["#1c1208", "#261a0d", "#ff8a00", "#f5e6c8"],
	},
	{
		id: "arrecife",
		name: "Reef",
		description: "Deep ocean with bioluminescent teal accents.",
		isLight: false,
		swatches: ["#040f1a", "#071628", "#09b7a6", "#d8f0f5"],
	},
	{
		id: "aurora",
		name: "Aurora",
		description: "Soft pastel lavender and teal with warm highlights.",
		isLight: true,
		swatches: ["#F7F2FF", "#E9D5FF", "#7C3AED", "#06B6D4"],
	},
	/*{
		id: "contraste",
		name: "High Contrast",
		description: "Bold black & white theme with a vivid accent for accessibility.",
		isLight: false,
		swatches: ["#000000", "#ffffff", "#FFCC00", "#00B4D8"],
	},*/
	{
		id: "nebula",
		name: "Nebula",
		description: "Dark nebula theme with neon highlights.",
		isLight: false,
		swatches: ["#000823", "#0d152e", "#5ae1ff", "#ffffff"],
	},
];
