export function KeyboardIcon({ className = "w-5 h-5" }: { className?: string }) {
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
			<rect x="2" y="6" width="20" height="12" rx="2" />
			<path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M5 14h.01M9 14h.01M13 14h6" />
		</svg>
	);
}
