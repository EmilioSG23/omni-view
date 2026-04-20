export function FullscreenIcon({ className = "w-5 h-5" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			className={className}
			aria-hidden="true"
		>
			<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
		</svg>
	);
}
