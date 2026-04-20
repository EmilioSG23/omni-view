export type QualityPreset = "performance" | "balanced" | "quality" | "custom";

export interface QualityConfig {
	fps: number;
	/**
	 * Encoder quality hint 1–100.
	 * Used by the image fallback encoder (JPEG/PNG/WebP).
	 * In H264/fMP4 mode the agent uses fps as the primary quality lever and
	 * this value has no effect unless the encoder maps it to a CRF parameter.
	 */
	quality: number;
}
