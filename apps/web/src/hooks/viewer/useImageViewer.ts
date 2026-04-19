// ─── Image fallback viewer (JPEG / PNG) ──────────────────────────────────────

import { useEffect } from "react";
import { AgentSession } from "../../services/agent-ws";
import { isFmpFrame } from "../../utils/identify-format";

export function useImageViewer(
	canvasRef: React.RefObject<HTMLCanvasElement | null>,
	session: AgentSession | null,
) {
	useEffect(() => {
		if (!session || !canvasRef.current) return;
		const ctx = canvasRef.current.getContext("2d");
		const off = session.on("binaryFrame", (buf) => {
			if (isFmpFrame(buf)) return; // fMP4 data goes to video
			const blob = new Blob([buf]);
			createImageBitmap(blob)
				.then((bmp) => {
					const canvas = canvasRef.current;
					if (!canvas || !ctx) return;
					canvas.width = bmp.width;
					canvas.height = bmp.height;
					ctx.drawImage(bmp, 0, 0);
					bmp.close();
				})
				.catch(() => {
					/* not a valid image */
				});
		});
		return off;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session]);
}
