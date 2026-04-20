export function EyeIcon({ className = "w-4 h-4" }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<ellipse
				cx="12"
				cy="12"
				rx="9"
				ry="5.5"
				stroke="currentColor"
				strokeWidth={1.5}
				fill="none"
			/>
			<circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.5} fill="none" />
		</svg>
	);
}
