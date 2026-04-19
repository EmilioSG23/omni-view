/**
 * Returns a human-readable "time ago" string from an ISO 8601 timestamp.
 * e.g. "just now", "5m ago", "2h ago", "3d ago"
 */
export function formatAge(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const s = Math.floor(diff / 1000);
	if (s < 60) return "just now";
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

/**
 * Truncates a device/agent UUID for display: first 8 chars + ellipsis + last 6 chars.
 * e.g. "a1b2c3d4…e5f6a7b8" (safe for IDs shorter than 18 chars — returned as-is).
 */
export function truncateDeviceId(id: string): string {
	return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}
