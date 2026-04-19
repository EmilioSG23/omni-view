import type React from "react";

interface ViewerHeaderProps {
	onBack: () => void;
	label: string;
	children?: React.ReactNode;
}

export function ViewerHeader({ onBack, label, children }: ViewerHeaderProps) {
	return (
		<header
			role="banner"
			className="h-header border-b border-border flex items-center px-5 gap-4 shrink-0"
		>
			<button
				type="button"
				onClick={onBack}
				aria-label="Back to directory"
				className="flex items-center gap-2 text-secondary text-xs font-mono px-2 h-7 border border-border rounded cursor-pointer hover:text-primary hover:border-border-strong transition-[color,border-color] duration-120"
			>
				← back
			</button>

			<span className="font-mono font-semibold text-sm text-primary">{label}</span>

			<span className="flex-1" />

			{children}
		</header>
	);
}
