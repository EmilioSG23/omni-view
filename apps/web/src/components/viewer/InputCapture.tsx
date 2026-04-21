// ─── InputCapture ─────────────────────────────────────────────────────────────
// Transparent overlay that captures pointer and keyboard events from the viewer
// and forwards them to the host via the WebRTC DataChannel.

import type { RemoteInputEvent } from "@omni-view/shared";
import { useEffect, useRef } from "react";

interface InputCaptureProps {
	sendInput: (event: RemoteInputEvent) => void;
}

/** Minimum interval between mousemove messages sent to the host (≈60 fps). */
const MOUSEMOVE_THROTTLE_MS = 16;

export function InputCapture({ sendInput }: InputCaptureProps) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const lastMoveRef = useRef<number>(0);

	// ─── Keyboard events ──────────────────────────────────────────────────────
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			sendInput({
				type: "keydown",
				code: e.code,
				key: e.key,
				ctrlKey: e.ctrlKey,
				shiftKey: e.shiftKey,
				altKey: e.altKey,
				metaKey: e.metaKey,
			});
		};
		const onKeyUp = (e: KeyboardEvent) => {
			sendInput({
				type: "keyup",
				code: e.code,
				key: e.key,
				ctrlKey: e.ctrlKey,
				shiftKey: e.shiftKey,
				altKey: e.altKey,
				metaKey: e.metaKey,
			});
		};
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("keyup", onKeyUp);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("keyup", onKeyUp);
		};
	}, [sendInput]);

	// ─── Helpers ─────────────────────────────────────────────────────────────

	/** Returns mouse position normalized to [0, 1] relative to the overlay. */
	function normalizePointer(e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } {
		const rect = overlayRef.current?.getBoundingClientRect();
		if (!rect) return { x: 0, y: 0 };
		return {
			x: (e.clientX - rect.left) / rect.width,
			y: (e.clientY - rect.top) / rect.height,
		};
	}

	// ─── Pointer events ───────────────────────────────────────────────────────

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const now = Date.now();
		if (now - lastMoveRef.current < MOUSEMOVE_THROTTLE_MS) return;
		lastMoveRef.current = now;
		const { x, y } = normalizePointer(e);
		sendInput({ type: "mousemove", x, y });
	};

	const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		const { x, y } = normalizePointer(e);
		sendInput({ type: "mousedown", button: e.button, x, y });
	};

	const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
		const { x, y } = normalizePointer(e);
		sendInput({ type: "mouseup", button: e.button, x, y });
	};

	const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
		sendInput({ type: "wheel", deltaX: e.deltaX, deltaY: e.deltaY });
	};

	return (
		<div
			ref={overlayRef}
			className="absolute inset-0 z-10 cursor-crosshair"
			onMouseMove={handleMouseMove}
			onMouseDown={handleMouseDown}
			onMouseUp={handleMouseUp}
			onWheel={handleWheel}
			// Prevent the default context menu so right-clicks are forwarded cleanly.
			onContextMenu={(e) => e.preventDefault()}
		/>
	);
}
