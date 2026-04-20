export function ThemeIcon({ className = "h-4 w-4" }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			{/* Outer circle (palette body) */}
			<circle cx="12" cy="12" r="10" />
			{/* Color dot — top */}
			<circle cx="12" cy="5.5" r="1.2" fill="currentColor" stroke="none" />
			{/* Color dot — top-right */}
			<circle cx="17.2" cy="8.8" r="1.2" fill="currentColor" stroke="none" />
			{/* Color dot — bottom-right */}
			<circle cx="17.2" cy="15.2" r="1.2" fill="currentColor" stroke="none" />
			{/* Color dot — bottom */}
			<circle cx="12" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
			{/* Color dot — bottom-left */}
			<circle cx="6.8" cy="15.2" r="1.2" fill="currentColor" stroke="none" />
			{/* Color dot — top-left */}
			<circle cx="6.8" cy="8.8" r="1.2" fill="currentColor" stroke="none" />
			{/* Center thumb hole */}
			<circle cx="12" cy="12" r="2.2" />
		</svg>
	);
}
