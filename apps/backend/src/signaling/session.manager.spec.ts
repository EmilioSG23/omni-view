import { SessionManager } from "@/signaling/session.manager";
import { WebSocket } from "ws";

type FakeWs = WebSocket & { close: jest.Mock };

function makeFakeWs(): FakeWs {
	return {
		readyState: WebSocket.OPEN,
		OPEN: WebSocket.OPEN,
		CONNECTING: WebSocket.CONNECTING,
		close: jest.fn(),
	} as unknown as FakeWs;
}

describe("SessionManager", () => {
	let manager: SessionManager;

	beforeEach(() => {
		manager = new SessionManager();
	});

	it("stores and resolves host socket by agentId", () => {
		const hostWs = makeFakeWs();

		manager.setHost("agent-1", hostWs, "hash");

		expect(manager.hasHost("agent-1")).toBe(true);
		expect(manager.getHostSocket("agent-1")).toBe(hostWs);
		expect(manager.getHostPasswordHash("agent-1")).toBe("hash");
	});

	it("evicts duplicated viewer for same (agentId, viewerId)", () => {
		const oldViewerWs = makeFakeWs();
		const newViewerWs = makeFakeWs();

		manager.registerViewerSocket(oldViewerWs, {
			agentId: "agent-1",
			viewerId: "viewer-1",
			connectedAt: new Date().toISOString(),
		});

		const evicted = manager.registerViewerSocket(newViewerWs, {
			agentId: "agent-1",
			viewerId: "viewer-1",
			connectedAt: new Date().toISOString(),
		});

		expect(evicted).toEqual([oldViewerWs]);
		expect(manager.findViewerSocket("agent-1", "viewer-1")).toBe(newViewerWs);
	});

	it("clears pending request and timeout together", () => {
		const viewerWs = makeFakeWs();
		const timeoutHandle = setTimeout(() => undefined, 10_000);

		manager.setPendingRequest("req-1", {
			type: "access",
			agentId: "agent-1",
			deviceId: "device-1",
			viewerWs,
		});
		manager.setPendingTimeout("req-1", timeoutHandle);

		const pending = manager.clearPendingRequest("req-1");

		expect(pending?.agentId).toBe("agent-1");
		expect(manager.getPendingRequest("req-1")).toBeUndefined();
		expect(manager.getPendingRequestIdBySocket(viewerWs)).toBeUndefined();
	});

	it("cleanupSocket removes host, viewer, and pending state", () => {
		const hostWs = makeFakeWs();
		const viewerWs = makeFakeWs();

		manager.setHost("agent-1", hostWs, "hash");
		manager.registerViewerSocket(viewerWs, {
			agentId: "agent-1",
			viewerId: "viewer-1",
			connectedAt: new Date().toISOString(),
		});
		manager.setPendingRequest("req-1", {
			type: "viewer",
			agentId: "agent-1",
			deviceId: "viewer-1",
			viewerId: "viewer-1",
			viewerWs,
		});

		const hostCleanup = manager.cleanupSocket(hostWs);
		expect(hostCleanup.evictedAgentId).toBe("agent-1");
		expect(manager.getHostSocket("agent-1")).toBeUndefined();

		const viewerCleanup = manager.cleanupSocket(viewerWs);
		expect(viewerCleanup.viewerMeta?.viewerId).toBe("viewer-1");
		expect(manager.findViewerSocket("agent-1", "viewer-1")).toBeUndefined();
		expect(manager.getPendingRequest("req-1")).toBeUndefined();
	});
});