import { DEVICE_ID_STORAGE_KEY } from "@/consts";
import { generateNumericId } from "@omni-view/shared";

const STORAGE_KEY = DEVICE_ID_STORAGE_KEY;

/**
 * Returns a stable numeric device identifier that persists across page loads.
 * Generated once, stored in localStorage.
 */
export function getDeviceId(): string {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && /^\d+$/.test(stored)) return stored;
		const id = generateNumericId();
		localStorage.setItem(STORAGE_KEY, id);
		return id;
	} catch {
		// localStorage unavailable (e.g. private browsing or Electron sandbox) — generate ephemeral id
		return generateNumericId();
	}
}
