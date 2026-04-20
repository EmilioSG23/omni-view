// ─── Stream Transport ─────────────────────────────────────────────────────────

/**
 * Describes the binary frame format produced by the agent.
 *
 * - `"fmp4-h264"` — fragmented MP4 container with H.264 video (default).
 *   The first binary frame is the init segment (`ftyp`+`moov`); subsequent
 *   frames are `moof`+`mdat` chunks consumable via the MediaSource Extensions API.
 * - `"jpeg"` / `"png"` / `"webp"` — independent image frames (fallback encoders).
 *   Each binary frame is a complete, independently decodable image.
 */
export type StreamTransport = "fmp4-h264" | "jpeg" | "png" | "webp";
