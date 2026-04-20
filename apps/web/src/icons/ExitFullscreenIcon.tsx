export function ExitFullscreenIcon({ className = "w-5 h-5" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			className={className}
			aria-hidden="true"
		>
			<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
		</svg>
	);
}
