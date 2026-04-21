export const envs: Record<string, string[]> = {
	development: ["dev", "development", "local"],
	production: ["prod", "production", "live"],
	staging: ["stage", "staging", "preprod", "pre-production"],
	testing: ["test", "testing"],
};

export function isEnv(env: keyof typeof envs): boolean {
	const envValue = process.env.NODE_ENV?.toLowerCase() ?? "development";
	const validValues = envs[env];
	if (!validValues) {
		throw new Error(`Unknown environment: ${env}`);
	}
	return validValues.includes(envValue);
}
