import { useRef, useState } from "react";
import { ScreenArea } from "./components/ScreenArea";
import { Toolbar } from "./components/Toolbar";
import { useOmniViewWS } from "./hooks/useOmniViewWS";
import { useUIControls } from "./hooks/useUIControls";

export default function App() {
	const [wsUrl, setWsUrl] = useState("localhost:9001");

	// Single ref used both by the hook (renderer attachment) and as the fullscreen target.
	const screenRef = useRef<HTMLDivElement>(null);

	const {
		status,
		fps,
		isPaused,
		showPlaceholder,
		mseNotSupported,
		connect,
		disconnect,
		togglePause,
	} = useOmniViewWS(screenRef);

	const isConnected = status === "connected";

	const { isFullscreen, toggleFullscreen } = useUIControls(
		screenRef,
		status === "connected",
		togglePause,
	);

	return (
		<div className="flex flex-col h-dvh overflow-hidden bg-[#0d0d0d] text-[#e0e0e0] font-mono">
			<Toolbar
				wsUrl={wsUrl}
				onUrlChange={setWsUrl}
				status={status}
				fps={fps}
				isPaused={isPaused}
				isConnected={isConnected}
				isFullscreen={isFullscreen}
				onConnect={() => connect(wsUrl)}
				onDisconnect={disconnect}
				onTogglePause={togglePause}
				onToggleFullscreen={toggleFullscreen}
			/>
			<ScreenArea
				containerRef={screenRef}
				showPlaceholder={showPlaceholder}
				mseNotSupported={mseNotSupported}
			/>
		</div>
	);
}
