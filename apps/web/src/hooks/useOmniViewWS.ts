import { useCallback, useEffect, useRef, useState } from "react";
import OmniWSService from "../services/ws";

export type WsStatus = "idle" | "connecting" | "connected" | "error";

export interface OmniViewWS {
	status: WsStatus;
	fps: string;
	isPaused: boolean;
	showPlaceholder: boolean;
	mseNotSupported: boolean;
	connect: (rawUrl: string) => void;
	disconnect: () => void;
	togglePause: () => void;
}

/**
 * Manages a WebSocket connection to the omniview-agent.
 * Attaches canvas/video renderers imperatively to the provided container ref.
 */
export function useOmniViewWS(containerRef: React.RefObject<HTMLDivElement | null>): OmniViewWS {
	const [status, setStatus] = useState<WsStatus>("idle");
	const [fps, setFps] = useState("");
	const [isPaused, setIsPaused] = useState(false);
	const [showPlaceholder, setShowPlaceholder] = useState(true);
	const [mseNotSupported, setMseNotSupported] = useState(false);

	const serviceRef = useRef<OmniWSService | null>(null);
	const frameCountRef = useRef(0);
	// Keep a ref-copy of isPaused so the WS message handler never captures stale state.
	const isPausedRef = useRef(false);

	// ── FPS counter ──────────────────────────────────────────────────────────
	useEffect(() => {
		let lastTick = performance.now();
		const id = setInterval(() => {
			const now = performance.now();
			const elapsed = (now - lastTick) / 1000;
			if (elapsed > 0) {
				const fpsVal = (frameCountRef.current / elapsed).toFixed(1);
				setFps(status === "connected" ? `${fpsVal} fps` : "");
			}
			frameCountRef.current = 0;
			lastTick = now;
		}, 1000);
		return () => clearInterval(id);
	}, [status]);

	// ── Cleanup on unmount ───────────────────────────────────────────────────
	useEffect(() => {
		return () => {
			serviceRef.current?.dispose();
			serviceRef.current = null;
		};
	}, []);

	const destroyRenderer = useCallback(() => {
		serviceRef.current?.destroyRenderer();
	}, []);

	// ── Connect ──────────────────────────────────────────────────────────────
	const connect = useCallback(
		(rawUrl: string) => {
			const trimmed = rawUrl.trim();
			if (!trimmed) return;

			const container = containerRef.current;
			if (!container) return;

			// Normalise: prepend ws:// if the user omitted the scheme.
			const normalized =
				trimmed.startsWith("ws://") || trimmed.startsWith("wss://") ? trimmed : `ws://${trimmed}`;

			// Validate URL structure to prevent injection or invalid connections.
			let parsed: URL;
			try {
				parsed = new URL(normalized);
			} catch {
				console.error("[WS] Invalid URL:", normalized);
				return;
			}
			if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
				console.error("[WS] Only ws:// and wss:// schemes are allowed.");
				return;
			}

			setStatus("connecting");
			setMseNotSupported(false);

			const svc = new OmniWSService(container, {
				onOpen: () => {
					setStatus("connected");
					setShowPlaceholder(false);
					isPausedRef.current = false;
					setIsPaused(false);
				},
				onFrame: () => {
					frameCountRef.current++;
				},
				onMseNotSupported: () => {
					setMseNotSupported(true);
					setShowPlaceholder(true);
				},
				onError: () => {
					setStatus("error");
				},
				onClose: () => {
					setStatus("idle");
					setShowPlaceholder(true);
					setIsPaused(false);
					isPausedRef.current = false;
					setFps("");
					serviceRef.current = null;
				},
				onReinit: () => {
					// no-op: renderer reset handled inside service
				},
			});

			serviceRef.current = svc;
			svc.connect(normalized);
		},
		[containerRef, destroyRenderer],
	);

	// ── Disconnect ───────────────────────────────────────────────────────────
	const disconnect = useCallback(() => {
		serviceRef.current?.disconnect();
		serviceRef.current = null;
	}, []);

	// ── Toggle pause ─────────────────────────────────────────────────────────
	const togglePause = useCallback(() => {
		const svc = serviceRef.current;
		if (!svc) return;
		const next = !isPausedRef.current;
		isPausedRef.current = next;
		setIsPaused(next);
		svc.send(next ? "pause" : "resume");
	}, []);

	return {
		status,
		fps,
		isPaused,
		showPlaceholder,
		mseNotSupported,
		connect,
		disconnect,
		togglePause,
	};
}
