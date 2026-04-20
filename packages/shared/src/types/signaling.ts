// ─── WebRTC signaling — SDP / ICE primitives ─────────────────────────────────

/** SDP offer or answer description (avoids importing browser-only RTCSessionDescriptionInit). */
export interface SdpDescription {
	type: "offer" | "answer" | "pranswer" | "rollback";
	sdp: string;
}

/** ICE candidate (avoids importing browser-only RTCIceCandidateInit). */
export interface IceCandidatePayload {
	candidate: string;
	sdpMid: string | null;
	sdpMLineIndex: number | null;
}

// ─── WebRTC signaling — gateway event payloads ───────────────────────────────

/** Browser host → gateway: register as the capture host for this agent. */
export interface HostJoinPayload {
	agentId: string;
	/** SHA-256 hex of the session password — stored by gateway for viewer auth. */
	passwordHash: string;
}

/** Viewer → gateway: request to watch a browser-captured agent. */
export interface ViewerRequestPayload {
	agentId: string;
	viewerId: string;
	/** Plain-text password; gateway hashes and compares to the host's stored hash. */
	password: string;
	label?: string;
}

/** Host → gateway: forward SDP offer to a specific viewer. */
export interface WebRtcOfferPayload {
	agentId: string;
	viewerId: string;
	sdp: SdpDescription;
}

/** Viewer → gateway: forward SDP answer back to host. */
export interface WebRtcAnswerPayload {
	agentId: string;
	viewerId: string;
	sdp: SdpDescription;
}

/** Either side → gateway: relay an ICE candidate to the other peer. */
export interface WebRtcIcePayload {
	agentId: string;
	viewerId: string;
	candidate: IceCandidatePayload;
	/** true = sent by host → relay to viewer. false = sent by viewer → relay to host. */
	fromHost: boolean;
}
