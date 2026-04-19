import { useDevice } from "@/context/DeviceContext";
import { formatAge, truncateDeviceId } from "@/utils/format";
import type { ViewerInfo } from "@omni-view/shared";

function ViewerRow({ viewer, onKick }: { viewer: ViewerInfo; onKick: () => void }) {
	const connectedAgo = formatAge(viewer.connected_at);

	return (
		<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-elevated group">
			<div className="flex-1 min-w-0">
				<p className="text-xs text-primary truncate">
					{viewer.label ?? truncateDeviceId(viewer.viewer_id)}
				</p>
				<p className="text-xs text-muted">{connectedAgo}</p>
			</div>
			<button
				type="button"
				onClick={onKick}
				title="Kick viewer"
				className="text-muted hover:text-error transition-colors text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100"
			>
				Kick
			</button>
		</div>
	);
}

export function ConnectedViewersList() {
	const { viewers, kickViewer, captureState } = useDevice();

	return (
		<aside className="flex flex-col h-full gap-3 p-4 bg-surface rounded-xl border border-border min-w-0">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Viewers</h2>
				{viewers.length > 0 && (
					<span className="text-xs font-mono text-success">{viewers.length}</span>
				)}
			</div>

			{captureState !== "active" ? (
				<p className="text-xs text-muted text-center py-4">
					Start screen sharing to allow viewers.
				</p>
			) : viewers.length === 0 ? (
				<p className="text-xs text-muted text-center py-4">No viewers connected yet.</p>
			) : (
				<div className="flex flex-col gap-1.5">
					{viewers.map((v) => (
						<ViewerRow key={v.viewer_id} viewer={v} onKick={() => void kickViewer(v.viewer_id)} />
					))}
				</div>
			)}
		</aside>
	);
}
