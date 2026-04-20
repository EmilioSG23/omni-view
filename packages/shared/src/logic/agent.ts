import { AGENT_PASSWORD_MAX_LENGTH, DEVICE_ID_LENGTH } from "../consts";

/**
 * Generate a numeric device ID of {@link DEVICE_ID_LENGTH} digits.
 * Uses the shared Web Crypto API when available, falling back to Math.random.
 *
 * The first digit is forced to be non-zero to avoid leading-zero display issues.
 */
export function generateNumericId(length = DEVICE_ID_LENGTH): string {
	const cryptoObj = typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined;
	if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
		const bytes = new Uint8Array(length);
		cryptoObj.getRandomValues(bytes);
		let id = "";
		for (let i = 0; i < length; i++) {
			id += i === 0 ? (1 + (bytes[i] % 9)).toString() : (bytes[i] % 10).toString();
		}
		return id;
	}
	// Fallback for environments without Web Crypto
	let out = (Math.floor(Math.random() * 9) + 1).toString();
	while (out.length < length) out += Math.floor(Math.random() * 10).toString();
	return out;
}

/**
 * Generate a random agent password consisting of letters and digits only.
 * Uses the shared Web Crypto API when available, falling back to Math.random.
 */
export function generateAgentPassword(length = AGENT_PASSWORD_MAX_LENGTH): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	// Prefer secure RNG when available
	const cryptoObj = typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined;
	if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
		const arr = new Uint32Array(length);
		cryptoObj.getRandomValues(arr);
		let out = "";
		for (let i = 0; i < length; i++) {
			out += chars[arr[i] % chars.length];
		}
		return out;
	}

	let out = "";
	for (let i = 0; i < length; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}
