import type { WsStatus } from "../hooks/useOmniViewWS";

interface ToolbarProps {
	wsUrl: string;
	onUrlChange: (url: string) => void;
	status: WsStatus;
	fps: string;
	isPaused: boolean;
	isConnected: boolean;
	isFullscreen: boolean;
	onConnect: () => void;
	onDisconnect: () => void;
	onTogglePause: () => void;
	onToggleFullscreen: () => void;
}

const STATUS_CLASSES: Record<WsStatus, string> = {
	idle: "text-neutral-500 border-neutral-500",
	connecting: "text-amber-400 border-amber-400",
	connected: "text-emerald-400 border-emerald-400",
	error: "text-red-500 border-red-500",
};

export function Toolbar({
	wsUrl,
	onUrlChange,
	status,
	fps,
	isPaused,
	isConnected,
	isFullscreen,
	onConnect,
	onDisconnect,
	onTogglePause,
	onToggleFullscreen,
}: ToolbarProps) {
	return (
		<header className="flex items-center gap-3 px-4 py-2 bg-[#111] border-b border-[#222] shrink-0 flex-wrap">
			<h1 className="text-[0.85rem] font-mono tracking-[0.15em] text-[#5b9bd5] whitespace-nowrap select-none">
				⬛ OMNIVIEW
			</h1>

			<span
				className={`text-[0.7rem] font-mono px-2 py-0.5 rounded-sm border whitespace-nowrap ${STATUS_CLASSES[status]}`}
			>
				{status.toUpperCase()}
			</span>

			<div className="flex items-center gap-1.5 flex-1 min-w-55">
				<label
					htmlFor="ws-url"
					className="text-[0.7rem] font-mono text-neutral-600 whitespace-nowrap"
				>
					ws://
				</label>
				<input
					id="ws-url"
					type="text"
					value={wsUrl}
					onChange={(e) => onUrlChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !isConnected) onConnect();
					}}
					spellCheck={false}
					autoComplete="off"
					className="flex-1 bg-[#1a1a1a] text-[#e0e0e0] border border-[#333] rounded px-2 py-1 font-mono text-[0.8rem] focus:outline-none focus:border-[#5b9bd5] transition-colors"
				/>
			</div>

			<button onClick={onConnect} disabled={isConnected} className="omni-btn">
				Connect
			</button>
			<button onClick={onDisconnect} disabled={!isConnected} className="omni-btn">
				Disconnect
			</button>
			<button onClick={onTogglePause} disabled={!isConnected} className="omni-btn">
				{isPaused ? "Resume" : "Pause"}
			</button>
			<button onClick={onToggleFullscreen} className="omni-btn">
				{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
			</button>

			<span className="text-[0.7rem] font-mono text-neutral-600 whitespace-nowrap min-w-13.75 text-right tabular-nums">
				{fps}
			</span>
		</header>
	);
}
