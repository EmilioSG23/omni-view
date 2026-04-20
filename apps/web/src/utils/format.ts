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
 * Formats a numeric device ID for display by inserting a space every 3 digits.
 * e.g. "123456789012" → "123 456 789 012"
 * Non-digit characters (legacy UUIDs) are returned as-is.
 */
export function formatDeviceId(id: string): string {
	if (!/^\d+$/.test(id)) return id;
	return id.replace(/(\d{3})(?=\d)/g, "$1 ");
}
