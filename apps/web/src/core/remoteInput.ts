import {
	DEFAULT_REMOTE_INPUT_PERMISSIONS,
	INPUT_PROTOCOL_VERSION,
	type RemoteInputEvent,
	type RemoteInputFeature,
	type RemoteInputMessage,
	type RemoteInputPermissions,
} from "@omni-view/shared";

type RemoteInputEventMessage = Extract<RemoteInputMessage, { type: "input:event" }>;
type RemoteInputPermissionsMessage = Extract<RemoteInputMessage, { type: "input:permissions" }>;
type RemoteInputSyncRequestMessage = Extract<RemoteInputMessage, { type: "input:sync-request" }>;

export function getRemoteInputFeature(event: RemoteInputEvent): RemoteInputFeature {
	switch (event.type) {
		case "keydown":
		case "keyup":
			return "keyboard";
		case "mousemove":
		case "mousedown":
		case "mouseup":
		case "wheel":
			return "mouse";
	}

	return "mouse";
}

export function isRemoteInputEventAllowed(
	event: RemoteInputEvent,
	permissions: RemoteInputPermissions,
): boolean {
	const feature = getRemoteInputFeature(event);
	return permissions[feature];
}

export function createRemoteInputEventMessage(
	event: RemoteInputEvent,
	meta: Partial<Omit<RemoteInputEventMessage, "type" | "version" | "timestamp" | "event">> = {},
): RemoteInputEventMessage {
	return {
		type: "input:event",
		version: INPUT_PROTOCOL_VERSION,
		timestamp: Date.now(),
		event,
		...meta,
	};
}

export function createRemoteInputPermissionsMessage(
	permissions: RemoteInputPermissions,
	meta: Partial<
		Omit<RemoteInputPermissionsMessage, "type" | "version" | "timestamp" | "permissions">
	> = {},
): RemoteInputPermissionsMessage {
	return {
		type: "input:permissions",
		version: INPUT_PROTOCOL_VERSION,
		timestamp: Date.now(),
		permissions,
		...meta,
	};
}

export function createRemoteInputSyncRequestMessage(
	meta: Partial<Omit<RemoteInputSyncRequestMessage, "type" | "version" | "timestamp">> = {},
): RemoteInputSyncRequestMessage {
	return {
		type: "input:sync-request",
		version: INPUT_PROTOCOL_VERSION,
		timestamp: Date.now(),
		...meta,
	};
}

export function parseRemoteInputMessage(raw: string): RemoteInputMessage | null {
	try {
		const parsed = JSON.parse(raw) as Partial<RemoteInputMessage> | null;
		if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
			return null;
		}

		switch (parsed.type) {
			case "input:event":
				if (!parsed.event || typeof parsed.event !== "object") return null;
				return {
					type: parsed.type,
					version: INPUT_PROTOCOL_VERSION,
					timestamp: Number(parsed.timestamp ?? Date.now()),
					event: parsed.event as RemoteInputEvent,
					sessionId: parsed.sessionId,
					viewerId: parsed.viewerId,
					sequence: parsed.sequence,
				};
			case "input:permissions":
				return {
					type: parsed.type,
					version: INPUT_PROTOCOL_VERSION,
					timestamp: Number(parsed.timestamp ?? Date.now()),
					permissions: {
						...DEFAULT_REMOTE_INPUT_PERMISSIONS,
						...(parsed.permissions as Partial<RemoteInputPermissions> | undefined),
					},
					sessionId: parsed.sessionId,
					viewerId: parsed.viewerId,
					sequence: parsed.sequence,
				};
			case "input:sync-request":
				return {
					type: parsed.type,
					version: INPUT_PROTOCOL_VERSION,
					timestamp: Number(parsed.timestamp ?? Date.now()),
					sessionId: parsed.sessionId,
					viewerId: parsed.viewerId,
					sequence: parsed.sequence,
				};
			default:
				return null;
		}
	} catch {
		return null;
	}
}
