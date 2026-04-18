import { useCallback, useEffect, useState } from "react";

export function useUIControls(
	containerRef: React.RefObject<HTMLElement | null>,
	isConnected: boolean,
	onTogglePause: () => void,
) {
	const [isFullscreen, setIsFullscreen] = useState(false);

	const toggleFullscreen = useCallback(() => {
		if (!document.fullscreenElement) {
			containerRef.current
				?.requestFullscreen()
				.catch((err) => console.error("[fullscreen] request failed:", err));
		} else {
			document.exitFullscreen();
		}
	}, [containerRef]);

	useEffect(() => {
		const onChange = () => setIsFullscreen(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", onChange);
		return () => document.removeEventListener("fullscreenchange", onChange);
	}, []);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "F11") {
				e.preventDefault();
				toggleFullscreen();
			}
			if (e.key === " " && isConnected) {
				e.preventDefault();
				onTogglePause();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isConnected, onTogglePause, toggleFullscreen]);

	return { isFullscreen, toggleFullscreen };
}
