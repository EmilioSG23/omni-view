const STORAGE_KEY = "omniview:device_id";

/**
 * Returns a stable device identifier that persists across page loads.
 * Generated once, stored in localStorage.
 */
export function getDeviceId(): string {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) return stored;
		const id = crypto.randomUUID();
		localStorage.setItem(STORAGE_KEY, id);
		return id;
	} catch {
		// localStorage unavailable (e.g. private browsing or Electron sandbox) — generate ephemeral id
		return crypto.randomUUID();
	}
}
