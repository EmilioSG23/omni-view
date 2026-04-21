import { describe, expect, it, vi } from "vitest";

vi.mock("@/consts", () => ({
	BACKEND_URL: "http://localhost:4000/api",
}));

import { getSignalingUrl, sha256hex } from "@/core/webrtc";

describe("webrtc core helpers", () => {
	it("builds signaling WS url from backend base url", () => {
		expect(getSignalingUrl()).toBe("ws://localhost:4000/api/ws");
	});

	it("computes deterministic SHA-256 hash", async () => {
		const hash = await sha256hex("hello");
		expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
	});
});
