import React from "react";

interface Props {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

/**
 * Top-level error boundary that catches unexpected render errors
 * and shows a minimal recovery UI instead of a blank screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
	state: State = { hasError: false, error: null };

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		// Log to console for debugging. Wire to Sentry / other service here.
		console.error("[ErrorBoundary]", error, info.componentStack);
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback;

			return (
				<div
					role="alert"
					className="h-dvh flex flex-col items-center justify-center gap-4 font-mono p-8 bg-base text-secondary"
				>
					<span className="text-lg text-error">⚠ Unexpected error</span>
					<code className="text-xs text-muted max-w-120 break-all text-center">
						{this.state.error?.message}
					</code>
					<button
						onClick={() => this.setState({ hasError: false, error: null })}
						className="mt-2 px-4 py-2 font-mono text-xs text-secondary border border-border rounded cursor-pointer bg-transparent hover:opacity-75 transition-opacity duration-120"
					>
						try again
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
