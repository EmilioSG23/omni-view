// ─── Capture mode ─────────────────────────────────────────────────────────────

import { QualityPreset } from "./quality";

/**
 * How this agent captures and transmits its screen.
 * - `"native"`: Rust agent running locally, streams over a direct WebSocket (`ws_url`).
 * - `"browser"`: Browser tab using `getDisplayMedia`, streams via WebRTC through the backend gateway.
 */
export type CaptureMode = "native" | "browser";

export interface CaptureSettings {
	/** Quality preset that determines fps and encoder quality. */
	preset: Exclude<QualityPreset, "custom">;
	/** Whether to request system/tab audio alongside the video track. */
	audio: boolean;
	/** Target frames-per-second for the captured video track. Derived from preset. */
	fps: number;
}
