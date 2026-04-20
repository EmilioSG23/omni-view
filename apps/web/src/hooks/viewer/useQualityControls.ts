// ─── Quality controls ─────────────────────────────────────────────────────────

import { AgentSession } from "@/services/agent-ws";
import { QUALITY_PRESETS, QualityPreset } from "@omni-view/shared";
import { useCallback, useEffect, useState } from "react";

export function useQualityControls(session: AgentSession | null) {
	const [activePreset, setActivePreset] = useState<QualityPreset | null>(null);

	useEffect(() => {
		if (!session) return;
		const off = session.on("message", (msg) => {
			if (msg.type === "quality_changed") {
				const cfg = msg.config;
				const match = (
					Object.entries(QUALITY_PRESETS) as [
						QualityPreset,
						(typeof QUALITY_PRESETS)[Exclude<QualityPreset, "custom">],
					][]
				).find(([, p]) => p.fps === cfg.fps && p.quality === cfg.quality);
				setActivePreset(match ? match[0] : "custom");
			}
		});
		return off;
	}, [session]);

	const setPreset = useCallback((preset: QualityPreset) => session?.setQuality(preset), [session]);
	return { activePreset, setPreset };
}
