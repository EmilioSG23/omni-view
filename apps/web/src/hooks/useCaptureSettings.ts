// ─── Capture settings persistence ────────────────────────────────────────────
// Loads and saves CaptureSettings to localStorage so the host's last-used
// quality preset and audio preference survive page reloads.

import { type CaptureSettings, DEFAULT_CAPTURE_SETTINGS } from "@omni-view/shared";
import { useCallback, useState } from "react";

const STORAGE_KEY = "omniview:captureSettings";

function loadSettings(): CaptureSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			return {
				...DEFAULT_CAPTURE_SETTINGS,
				...(JSON.parse(raw) as Partial<CaptureSettings>),
			};
		}
	} catch {
		// Ignore parse errors; fall back to defaults.
	}
	return DEFAULT_CAPTURE_SETTINGS;
}

export function useCaptureSettings() {
	const [settings, setSettings] = useState<CaptureSettings>(loadSettings);

	const saveSettings = useCallback((next: CaptureSettings) => {
		setSettings(next);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// Ignore storage errors (e.g. private-browsing quota).
		}
	}, []);

	return { settings, saveSettings };
}
