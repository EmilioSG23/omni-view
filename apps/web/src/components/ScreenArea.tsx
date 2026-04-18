interface ScreenAreaProps {
	containerRef: React.RefObject<HTMLDivElement | null>;
	showPlaceholder: boolean;
	mseNotSupported: boolean;
}

/**
 * The main screen area. The `containerRef` div is used both as the fullscreen
 * target and as the mount point for the imperative canvas/video renderer.
 */
export function ScreenArea({ containerRef, showPlaceholder, mseNotSupported }: ScreenAreaProps) {
	return (
		<div
			ref={containerRef}
			className="flex-1 flex justify-center items-center overflow-hidden bg-black min-h-0"
		>
			{showPlaceholder && (
				<div className="text-center select-none pointer-events-none text-[#333] z-10">
					{mseNotSupported ? (
						<>
							<div className="text-5xl leading-none mb-3">⚠️</div>
							<p className="text-xs font-mono leading-7">
								H.264 / MSE is not supported on this browser.
								<br />
								Reconnect using <strong className="text-[#555]">?encoder=jpeg</strong>
								<br />
								<em className="text-[#555]">e.g. 192.168.x.x:9001?encoder=jpeg</em>
							</p>
						</>
					) : (
						<>
							<div className="text-6xl leading-none mb-3">🖥️</div>
							<p className="text-xs font-mono leading-7">
								Start <strong className="text-[#555]">omniview-agent</strong> on your PC,
								<br />
								enter its address and click <strong className="text-[#555]">Connect</strong>.
							</p>
						</>
					)}
				</div>
			)}
		</div>
	);
}
