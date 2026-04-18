import { hashPassword, generateSessionPassword } from "./crypto";

describe("hashPassword", () => {
	it("returns a 64-char hex string (SHA-256)", () => {
		const hash = hashPassword("secret");
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("is deterministic for the same input", () => {
		expect(hashPassword("abc")).toBe(hashPassword("abc"));
	});

	it("produces different hashes for different inputs", () => {
		expect(hashPassword("a")).not.toBe(hashPassword("b"));
	});

	it("matches known SHA-256 of empty string", () => {
		// echo -n "" | sha256sum → e3b0c44298fc1c149afb...
		expect(hashPassword("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});
});

describe("generateSessionPassword", () => {
	it("returns a 32-char hex string (16 random bytes)", () => {
		const pwd = generateSessionPassword();
		expect(pwd).toMatch(/^[0-9a-f]{32}$/);
	});

	it("generates unique passwords on each call", () => {
		expect(generateSessionPassword()).not.toBe(generateSessionPassword());
	});
});
