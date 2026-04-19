import { DEVICE_ID_STORAGE_KEY } from "../consts";

const STORAGE_KEY = DEVICE_ID_STORAGE_KEY;

/**
 * Generates a UUID v4. Uses `crypto.randomUUID()` when available (secure
 * contexts: HTTPS or localhost), otherwise falls back to `crypto.getRandomValues()`
 * which works in non-secure contexts such as LAN access over HTTP.
 */
function generateUUID(): string {
	if (typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	// Fallback for non-secure contexts (HTTP over LAN, mobile, etc.)
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant bits
	const hex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Returns a stable device identifier that persists across page loads.
 * Generated once, stored in localStorage.
 */
export function getDeviceId(): string {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) return stored;
		const id = generateUUID();
		localStorage.setItem(STORAGE_KEY, id);
		return id;
	} catch {
		// localStorage unavailable (e.g. private browsing or Electron sandbox) — generate ephemeral id
		return generateUUID();
	}
}
