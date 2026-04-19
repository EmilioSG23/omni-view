type StatusKey = string;

const STATUS_CLASSES: Record<StatusKey, { text: string; bg?: string }> = {
	SUCCESS: { text: "text-success", bg: "bg-success" },
	FAILED: { text: "text-error", bg: "bg-error" },
	LOADING: { text: "text-info", bg: "bg-info" },
	WAITING: { text: "text-muted" },
	SKIPPED: { text: "text-muted" },
	REQUEST: { text: "text-accent", bg: "bg-accent" },
	DEFAULT: { text: "text-secondary" },
};

type IconType = "check" | "x" | "spinner" | "minus" | "bell" | null;

const STATUS_ICON: Record<StatusKey, IconType> = {
	SUCCESS: "check",
	FAILED: "x",
	LOADING: "spinner",
	WAITING: "minus",
	SKIPPED: null,
	REQUEST: "bell",
	DEFAULT: null,
};

let customStatusClasses: Record<StatusKey, { text?: string; bg?: string; icon?: IconType }> = {};

export function extendStatusClasses(
	map: Record<string, { text?: string; bg?: string; icon?: IconType }>,
) {
	customStatusClasses = { ...customStatusClasses, ...map };
}

function resolvedClasses(status?: string) {
	const key = status ?? "DEFAULT";
	const defaults = STATUS_CLASSES[key] ?? STATUS_CLASSES.DEFAULT;
	const custom = customStatusClasses[key] ?? {};
	return {
		text: custom.text ?? defaults.text,
		bg: custom.bg ?? defaults.bg,
		icon: custom.icon !== undefined ? custom.icon : (STATUS_ICON[key] ?? STATUS_ICON.DEFAULT),
	};
}

export function getStatusColor(status?: string) {
	return resolvedClasses(status).text ?? "text-secondary";
}

export function getStatusBgColor(status?: string) {
	return resolvedClasses(status).bg ?? "bg-elevated";
}

export function getStatusClasses(status?: string) {
	const c = resolvedClasses(status);
	return `${c.text}${c.bg ? ` ${c.bg}` : ""}`.trim();
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	);
}

function XIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	);
}

function SpinnerIcon({ className }: { className?: string }) {
	return (
		<svg
			className={`${className} animate-spin`}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
			/>
		</svg>
	);
}

function MinusIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	);
}

function BellIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
			/>
		</svg>
	);
}

export function StatusIcon({ status, className }: { status?: string; className?: string }) {
	const { icon } = resolvedClasses(status);
	if (!icon) return <div className={className} />;
	switch (icon) {
		case "check":
			return <CheckIcon className={className} />;
		case "x":
			return <XIcon className={className} />;
		case "spinner":
			return <SpinnerIcon className={className} />;
		case "minus":
			return <MinusIcon className={className} />;
		case "bell":
			return <BellIcon className={className} />;
		default:
			return <div className={className} />;
	}
}
