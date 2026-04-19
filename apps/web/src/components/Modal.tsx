import { type ReactNode, useEffect } from "react";

interface ModalProps {
	onClose: () => void;
	children: ReactNode;
	/** CSS max-width value (default: "28rem"). */
	width?: string;
}

export function Modal({ onClose, children, width = "28rem" }: ModalProps) {
	// Close on Escape key
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] animate-fade-in"
				onClick={onClose}
				aria-hidden="true"
			/>
			{/* Panel */}
			<div
				role="dialog"
				aria-modal="true"
				className="fixed z-60 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] bg-surface border border-border-strong rounded-xl p-6 shadow-2xl animate-fade-in-down"
				style={{ maxWidth: width }}
			>
				{/* Close button */}
				<button
					type="button"
					onClick={onClose}
					className="absolute top-3 right-4 text-muted hover:text-error transition-colors text-xl leading-none"
					aria-label="Close dialog"
				>
					&times;
				</button>
				{children}
			</div>
		</>
	);
}
