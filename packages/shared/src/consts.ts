// Maximum allowed length for an agent session password. Projects should

import { CaptureSettings, QualityConfig, QualityPreset } from "./types";

// import this constant from `@omni-view/shared` to keep the same limit.
export const AGENT_PASSWORD_MAX_LENGTH = 8;

/**
 * Length (in digits) of a numeric device identifier, analogous to AnyDesk /
 * TeamViewer IDs. The raw value is stored without separators; use
 * `formatDeviceId` from the web app to display it with spaces.
 */
export const DEVICE_ID_LENGTH = 12;

export const QUALITY_PRESETS: Record<Exclude<QualityPreset, "custom">, QualityConfig> = {
	performance: { fps: 15, quality: 40 },
	balanced: { fps: 30, quality: 60 },
	quality: { fps: 60, quality: 80 },
};

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
	preset: "balanced",
	audio: false,
	fps: 30,
};
