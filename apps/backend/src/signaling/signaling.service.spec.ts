import { SessionManager } from "@/signaling/session.manager";
import { SignalingService } from "@/signaling/signaling.service";
import type { AgentNotification } from "@omni-view/shared";
import { SIGNALING } from "@omni-view/shared";
import { WebSocket } from "ws";

type FakeWs = WebSocket & { send: jest.Mock; close: jest.Mock };

function makeFakeWs(readyState: number = WebSocket.OPEN): FakeWs {
	return {
		readyState,
		OPEN: WebSocket.OPEN,
		CONNECTING: WebSocket.CONNECTING,
		send: jest.fn(),
		close: jest.fn(),
	} as unknown as FakeWs;
}

function makeAgentsService() {
	return {
		isBlacklisted: jest.fn().mockResolvedValue(false),
		isWhitelisted: jest.fn().mockResolvedValue(false),
		addToWhitelist: jest.fn().mockResolvedValue(undefined),
		addToBlacklist: jest.fn().mockResolvedValue(undefined),
	} as unknown as any;
}

describe("SignalingService", () => {
	let service: SignalingService;
	let sessions: SessionManager;
	let agentsSvc: ReturnType<typeof makeAgentsService>;

	beforeEach(() => {
		sessions = new SessionManager();
		agentsSvc = makeAgentsService();
		service = new SignalingService(sessions, agentsSvc);
	});

	// ─── Subscriptions ───────────────────────────────────────────────────────

	describe("handleSubscribe / handleUnsubscribe / notifyAgentSubscribers", () => {
		it("sends notifications to subscribed clients", () => {
			const ws = makeFakeWs();
			service.handleSubscribe(ws, "agent-1");

			const event = { type: "agent_online", agentId: "agent-1" } as const;
			service.notifyAgentSubscribers("agent-1", event as unknown as AgentNotification);

			expect(ws.send).toHaveBeenCalledWith(JSON.stringify(event));
		});

		it("does not send to clients subscribed to another agentId", () => {
			const ws1 = makeFakeWs();
			const ws2 = makeFakeWs();
			service.handleSubscribe(ws1, "agent-1");
			service.handleSubscribe(ws2, "agent-2");

			service.notifyAgentSubscribers("agent-1", { type: "ping" } as unknown as AgentNotification);

			expect(ws1.send).toHaveBeenCalledTimes(1);
			expect(ws2.send).not.toHaveBeenCalled();
		});

		it("skips clients that are not OPEN", () => {
			const wsClosed = makeFakeWs(WebSocket.CLOSED);
			service.handleSubscribe(wsClosed, "agent-1");

			service.notifyAgentSubscribers("agent-1", { type: "ping" } as unknown as AgentNotification);

			expect(wsClosed.send).not.toHaveBeenCalled();
		});

		it("removes client after handleUnsubscribe", () => {
			const ws = makeFakeWs();
			service.handleSubscribe(ws, "agent-1");
			service.handleUnsubscribe(ws);

			service.notifyAgentSubscribers("agent-1", { type: "ping" } as unknown as AgentNotification);

			expect(ws.send).not.toHaveBeenCalled();
		});
	});

	// ─── handleHostJoin ───────────────────────────────────────────────────────

	describe("handleHostJoin", () => {
		it("registers the host socket", () => {
			const ws = makeFakeWs();
			service.handleHostJoin(ws, { agentId: "a1", passwordHash: "x".repeat(64) });

			expect(sessions.hasHost("a1")).toBe(true);
			expect(sessions.getHostSocket("a1")).toBe(ws);
		});
	});

	// ─── handleViewerRequest ─────────────────────────────────────────────────

	describe("handleViewerRequest", () => {
		it("rejects viewer when host is not connected", async () => {
			const viewerWs = makeFakeWs();

			await service.handleViewerRequest(viewerWs, {
				agentId: "a1",
				viewerId: "v1",
				password: "",
				label: undefined,
			});

			const sent = JSON.parse((viewerWs.send as jest.Mock).mock.calls[0][0]);
			expect(sent.event).toBe(SIGNALING.VIEWER_REJECTED);
			expect(sent.reason).toBe("host_not_available");
		});

		it("rejects blacklisted viewer", async () => {
			agentsSvc.isBlacklisted.mockResolvedValue(true);
			const hostWs = makeFakeWs();
			const viewerWs = makeFakeWs();
			service.handleHostJoin(hostWs, { agentId: "a1", passwordHash: "" });

			await service.handleViewerRequest(viewerWs, {
				agentId: "a1",
				viewerId: "v1",
				password: "",
				label: undefined,
			});

			const sent = JSON.parse((viewerWs.send as jest.Mock).mock.calls[0][0]);
			expect(sent.event).toBe(SIGNALING.VIEWER_REJECTED);
			expect(sent.reason).toBe("blacklisted");
		});

		it("sends VIEWER_PENDING and notifies host when viewer is unknown", async () => {
			agentsSvc.isBlacklisted.mockResolvedValue(false);
			agentsSvc.isWhitelisted.mockResolvedValue(false);
			const hostWs = makeFakeWs();
			const viewerWs = makeFakeWs();
			service.handleHostJoin(hostWs, { agentId: "a1", passwordHash: "" });

			await service.handleViewerRequest(viewerWs, {
				agentId: "a1",
				viewerId: "v1",
				password: "",
				label: "Alice",
			});

			const viewerMsg = JSON.parse((viewerWs.send as jest.Mock).mock.calls[0][0]);
			expect(viewerMsg.event).toBe(SIGNALING.VIEWER_PENDING);

			const hostMsg = JSON.parse((hostWs.send as jest.Mock).mock.calls[0][0]);
			expect(hostMsg.event).toBe(SIGNALING.ACCESS_REQUESTED);
			expect(hostMsg.deviceId).toBe("v1");
		});

		it("registers viewer directly when already whitelisted", async () => {
			agentsSvc.isBlacklisted.mockResolvedValue(false);
			agentsSvc.isWhitelisted.mockResolvedValue(true);
			const hostWs = makeFakeWs();
			const viewerWs = makeFakeWs();
			service.handleHostJoin(hostWs, { agentId: "a1", passwordHash: "" });

			await service.handleViewerRequest(viewerWs, {
				agentId: "a1",
				viewerId: "v1",
				password: "",
				label: undefined,
			});

			const hostMsg = JSON.parse((hostWs.send as jest.Mock).mock.calls[0][0]);
			expect(hostMsg.event).toBe(SIGNALING.VIEWER_JOINED);
			expect(sessions.findViewerSocket("a1", "v1")).toBe(viewerWs);
		});
	});

	// ─── handleAccessGrant / handleAccessDeny ────────────────────────────────

	describe("handleAccessGrant", () => {
		it("registers viewer and notifies host when grant is for a viewer-type request", async () => {
			agentsSvc.isBlacklisted.mockResolvedValue(false);
			agentsSvc.isWhitelisted.mockResolvedValue(false);
			const hostWs = makeFakeWs();
			const viewerWs = makeFakeWs();
			service.handleHostJoin(hostWs, { agentId: "a1", passwordHash: "" });

			// Put a pending request in place
			await service.handleViewerRequest(viewerWs, {
				agentId: "a1",
				viewerId: "v1",
				password: "",
				label: "Bob",
			});
			const hostMsg = JSON.parse((hostWs.send as jest.Mock).mock.calls[0][0]);
			const requestId: string = hostMsg.requestId;

			hostWs.send.mockClear();
			viewerWs.send.mockClear();

			await service.handleAccessGrant({ requestId, agentId: "a1" });

			const viewerApproved = JSON.parse((viewerWs.send as jest.Mock).mock.calls[0][0]);
			expect(viewerApproved.event).toBe(SIGNALING.VIEWER_APPROVED);

			const hostJoined = JSON.parse((hostWs.send as jest.Mock).mock.calls[0][0]);
			expect(hostJoined.event).toBe(SIGNALING.VIEWER_JOINED);
		});
	});

	describe("handleAccessDeny", () => {
		it("sends VIEWER_REJECTED for viewer-type request", async () => {
			agentsSvc.isBlacklisted.mockResolvedValue(false);
			agentsSvc.isWhitelisted.mockResolvedValue(false);
			const hostWs = makeFakeWs();
			const viewerWs = makeFakeWs();
			service.handleHostJoin(hostWs, { agentId: "a1", passwordHash: "" });

			await service.handleViewerRequest(viewerWs, {
				agentId: "a1",
				viewerId: "v1",
				password: "",
				label: undefined,
			});
			const hostMsg = JSON.parse((hostWs.send as jest.Mock).mock.calls[0][0]);
			const requestId: string = hostMsg.requestId;

			viewerWs.send.mockClear();
			await service.handleAccessDeny({ requestId, agentId: "a1" });

			const msg = JSON.parse((viewerWs.send as jest.Mock).mock.calls[0][0]);
			expect(msg.event).toBe(SIGNALING.VIEWER_REJECTED);
		});
	});

	// ─── kickViewer ──────────────────────────────────────────────────────────

	describe("kickViewer", () => {
		it("closes viewer socket and notifies host", async () => {
			agentsSvc.isBlacklisted.mockResolvedValue(false);
			agentsSvc.isWhitelisted.mockResolvedValue(true);
			const hostWs = makeFakeWs();
			const viewerWs = makeFakeWs();
			service.handleHostJoin(hostWs, { agentId: "a1", passwordHash: "" });

			await service.handleViewerRequest(viewerWs, {
				agentId: "a1",
				viewerId: "v1",
				password: "",
				label: undefined,
			});

			hostWs.send.mockClear();
			service.kickViewer("a1", "v1");

			const sent = JSON.parse((viewerWs.send as jest.Mock).mock.calls[0][0]);
			expect(sent.event).toBe(SIGNALING.VIEWER_KICKED);
			expect(viewerWs.close).toHaveBeenCalled();

			const hostNotif = JSON.parse((hostWs.send as jest.Mock).mock.calls[0][0]);
			expect(hostNotif.event).toBe(SIGNALING.VIEWER_LEFT);
		});

		it("is a no-op when viewer is not connected", () => {
			service.handleHostJoin(makeFakeWs(), { agentId: "a1", passwordHash: "" });
			expect(() => service.kickViewer("a1", "nonexistent")).not.toThrow();
		});
	});

	// ─── getViewers ──────────────────────────────────────────────────────────

	describe("getViewers", () => {
		it("returns empty array when no viewers are connected", () => {
			expect(service.getViewers("a1")).toEqual([]);
		});

		it("returns one entry per unique viewerId", async () => {
			agentsSvc.isBlacklisted.mockResolvedValue(false);
			agentsSvc.isWhitelisted.mockResolvedValue(true);
			const hostWs = makeFakeWs();
			service.handleHostJoin(hostWs, { agentId: "a1", passwordHash: "" });

			const ws1 = makeFakeWs();
			const ws2 = makeFakeWs();
			await service.handleViewerRequest(ws1, {
				agentId: "a1",
				viewerId: "v1",
				password: "",
				label: "A",
			});
			await service.handleViewerRequest(ws2, {
				agentId: "a1",
				viewerId: "v2",
				password: "",
				label: "B",
			});

			const viewers = service.getViewers("a1");
			expect(viewers).toHaveLength(2);
			expect(viewers.map((v) => v.viewer_id).sort()).toEqual(["v1", "v2"]);
		});
	});

	// ─── handleDisconnect ────────────────────────────────────────────────────

	describe("handleDisconnect", () => {
		it("notifies host when a viewer disconnects", async () => {
			agentsSvc.isBlacklisted.mockResolvedValue(false);
			agentsSvc.isWhitelisted.mockResolvedValue(true);
			const hostWs = makeFakeWs();
			const viewerWs = makeFakeWs();
			service.handleHostJoin(hostWs, { agentId: "a1", passwordHash: "" });

			await service.handleViewerRequest(viewerWs, {
				agentId: "a1",
				viewerId: "v1",
				password: "",
				label: undefined,
			});

			hostWs.send.mockClear();
			service.handleDisconnect(viewerWs);

			const msg = JSON.parse((hostWs.send as jest.Mock).mock.calls[0][0]);
			expect(msg.event).toBe(SIGNALING.VIEWER_LEFT);
			expect(msg.viewerId).toBe("v1");
		});
	});
});
