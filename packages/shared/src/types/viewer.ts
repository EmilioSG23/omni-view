/** A viewer currently watching an agent's screen via WebRTC. */
export interface ViewerInfo {
	viewer_id: string;
	/** Optional human-readable label (device name, etc.). */
	label?: string;
	/** ISO 8601 timestamp of when the viewer connected. */
	connected_at: string;
}
