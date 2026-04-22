export function MouseIcon({ className = "w-5 h-5" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<rect x="7" y="2.5" width="10" height="19" rx="5" />
			<path d="M12 2.5v6" />
		</svg>
	);
}
