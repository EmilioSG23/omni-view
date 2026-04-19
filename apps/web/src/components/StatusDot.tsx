import type { SessionState } from "../core/agent-ws";

interface StatusDotProps {
	state: SessionState | "online" | "offline";
	size?: number;
}

const STATE_COLOR: Record<string, string> = {
	online: "var(--success)",
	streaming: "var(--success)",
	offline: "var(--color-muted)",
	idle: "var(--color-muted)",
	closed: "var(--color-muted)",
	connecting: "var(--accent)",
	authenticating: "var(--accent)",
	paused: "var(--warn)",
	degraded: "var(--error)",
};

const PULSE_STATES = new Set(["connecting", "authenticating", "streaming", "online"]);

export function StatusDot({ state, size = 8 }: StatusDotProps) {
	const color = STATE_COLOR[state] ?? "var(--color-muted)";
	const pulse = PULSE_STATES.has(state);
	const animate = pulse && state !== "streaming" && state !== "online";

	return (
		<span
			className="inline-block rounded-full shrink-0"
			style={{
				width: size,
				height: size,
				backgroundColor: color,
				boxShadow: pulse ? `0 0 0 2px var(--bg-surface), 0 0 6px ${color}` : "none",
				animation: animate ? "dot-pulse 1.2s ease-in-out infinite" : "none",
			}}
			aria-hidden="true"
		/>
	);
}
