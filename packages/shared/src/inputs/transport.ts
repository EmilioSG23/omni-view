import type { RemoteInputMessage } from "./index";

export type RemoteInputTransportState = "idle" | "connecting" | "open" | "closed";

export type RemoteInputMessageListener = (message: RemoteInputMessage) => void;

/**
 * Transport-agnostic contract for moving remote-input messages between peers.
 * Implementations may wrap WebRTC DataChannels, WebSockets, native bridges, or tests.
 */
export interface RemoteInputTransportAdapter {
	readonly state: RemoteInputTransportState;
	send(message: RemoteInputMessage): void;
	subscribe(listener: RemoteInputMessageListener): () => void;
	close?(): void;
}
