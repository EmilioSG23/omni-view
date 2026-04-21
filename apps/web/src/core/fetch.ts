import { BACKEND_URL as BASE } from "@/consts";

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
	const headers = new Headers(init?.headers);
	if (init?.body != null && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const res = await fetch(`${BASE}${path}`, {
		headers,
		...init,
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
	}
	return res.json() as Promise<T>;
}
