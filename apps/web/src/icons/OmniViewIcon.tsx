export function OmniViewIcon({ className = "h-6 w-6" }: { className?: string }) {
	const cls = ["block", className].filter(Boolean).join(" ");
	return (
		<svg
			viewBox="0 0 24 20"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={cls}
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<rect x={2} y={4} width={20} height={12} rx={2} />
			<circle cx={12} cy={10} r={3.5} />
			<path d="M8 18h8" />
		</svg>
	);
}

export default OmniViewIcon;
