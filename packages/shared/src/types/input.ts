// ─── Remote input events — sent from viewer to host over WebRTC DataChannel ───

export interface RemoteMouseMoveEvent {
	type: "mousemove";
	/** Normalised [0, 1] horizontal position relative to the video surface. */
	x: number;
	/** Normalised [0, 1] vertical position relative to the video surface. */
	y: number;
}

export interface RemoteMouseButtonEvent {
	type: "mousedown" | "mouseup";
	/** 0 = left, 1 = middle, 2 = right */
	button: number;
	x: number;
	y: number;
}

export interface RemoteWheelEvent {
	type: "wheel";
	deltaX: number;
	deltaY: number;
}

export interface RemoteKeyboardEvent {
	type: "keydown" | "keyup";
	/** KeyboardEvent.code — e.g. "KeyA", "Enter", "ArrowLeft" */
	code: string;
	/** KeyboardEvent.key — printable character or named key */
	key: string;
	ctrlKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
}

/** Union of all input events that the viewer may send to the host. */
export type RemoteInputEvent =
	| RemoteMouseMoveEvent
	| RemoteMouseButtonEvent
	| RemoteWheelEvent
	| RemoteKeyboardEvent;

/** DataChannel label used for the remote-input channel. */
export const INPUT_CHANNEL_LABEL = "input-events" as const;
