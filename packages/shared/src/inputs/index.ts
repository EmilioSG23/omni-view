export type RemoteInputEvent =
	| {
			type: "mousemove";
			/** Normalised [0, 1] horizontal position relative to the video surface. */
			x: number;
			/** Normalised [0, 1] vertical position relative to the video surface. */
			y: number;
	  }
	| {
			type: "mousedown" | "mouseup";
			/** 0 = left, 1 = middle, 2 = right */
			button: number;
			x: number;
			y: number;
	  }
	| {
			type: "wheel";
			deltaX: number;
			deltaY: number;
	  }
	| {
			type: "keydown" | "keyup";
			/** KeyboardEvent.code — e.g. "KeyA", "Enter", "ArrowLeft" */
			code: string;
			/** KeyboardEvent.key — printable character or named key */
			key: string;
			ctrlKey?: boolean;
			shiftKey?: boolean;
			altKey?: boolean;
			metaKey?: boolean;
	  };

export type RemoteInputFeature = "keyboard" | "mouse" | "audio" | "video";

export interface RemoteInputPermissions {
	keyboard: boolean;
	mouse: boolean;
	audio: boolean;
	video: boolean;
}

export const DEFAULT_REMOTE_INPUT_PERMISSIONS: RemoteInputPermissions = {
	keyboard: false,
	mouse: false,
	audio: true,
	video: true,
};

export const INPUT_PROTOCOL_VERSION = 1 as const;

type RemoteInputMessageMeta = {
	version: typeof INPUT_PROTOCOL_VERSION;
	timestamp: number;
	sessionId?: string;
	viewerId?: string;
	sequence?: number;
};

export type RemoteInputMessage =
	| (RemoteInputMessageMeta & {
			type: "input:event";
			event: RemoteInputEvent;
	  })
	| (RemoteInputMessageMeta & {
			type: "input:permissions";
			permissions: RemoteInputPermissions;
	  })
	| (RemoteInputMessageMeta & {
			type: "input:sync-request";
	  });

/** DataChannel label used for the remote-input channel. */
export const INPUT_CHANNEL_LABEL = "input-events" as const;

export * from "./transport";
