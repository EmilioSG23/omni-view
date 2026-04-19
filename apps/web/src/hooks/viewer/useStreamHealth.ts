// ─── Stream health (FPS + last-frame age) ────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { AgentSession } from "../../services/agent-ws";

export function useStreamHealth(session: AgentSession | null) {
	const frameTimesRef = useRef<number[]>([]);
	const [fps, setFps] = useState(0);
	const [lastFrameAge, setLastFrameAge] = useState<number | null>(null);

	useEffect(() => {
		if (!session) {
			frameTimesRef.current = [];
			setFps(0);
			setLastFrameAge(null);
			return;
		}
		const offFrame = session.on("binaryFrame", () => {
			const now = Date.now();
			frameTimesRef.current.push(now);
			const cutoff = now - 1000;
			frameTimesRef.current = frameTimesRef.current.filter((t) => t > cutoff);
			setFps(frameTimesRef.current.length);
			setLastFrameAge(0);
		});
		const timer = setInterval(() => {
			const times = frameTimesRef.current;
			if (times.length > 0) setLastFrameAge(Date.now() - times[times.length - 1]);
		}, 200);
		return () => {
			offFrame();
			clearInterval(timer);
		};
	}, [session]);

	return { fps, lastFrameAge };
}
