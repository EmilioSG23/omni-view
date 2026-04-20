interface ControlButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children: React.ReactNode;
}

export function ControlButton({ children, className, ...rest }: ControlButtonProps) {
	return (
		<button
			{...rest}
			className={`h-7 px-3 font-mono text-xs text-secondary border border-border rounded bg-transparent cursor-pointer transition-opacity duration-120 hover:opacity-75 ${className ?? ""}`.trim()}
		>
			{children}
		</button>
	);
}
