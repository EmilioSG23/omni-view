const BASE =
	(window as { electronAPI?: { backendUrl?: string } }).electronAPI?.backendUrl ?? "/api";

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { "Content-Type": "application/json", ...init?.headers },
		...init,
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
	}
	return res.json() as Promise<T>;
}
