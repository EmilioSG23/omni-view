import { createHash, randomBytes } from "crypto";

/** Hash a password the same way the Rust agent does (SHA-256 hex). */
export function hashPassword(password: string): string {
	return createHash("sha256").update(password).digest("hex");
}

/** Generate a cryptographically secure random password for session credentials. */
export function generateSessionPassword(): string {
	return randomBytes(16).toString("hex");
}
