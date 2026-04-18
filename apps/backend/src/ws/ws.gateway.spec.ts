import { WsGateway } from "./ws.gateway";
import { WebSocket } from "ws";

/** Minimal fake WebSocket — only the surface WsGateway touches.
 * Must include `OPEN` as an instance property because the gateway checks
 * `ws.readyState === ws.OPEN` (instance, not static). */
function makeFakeWs(readyState: number = WebSocket.OPEN) {
	return {
		readyState,
		send: jest.fn(),
		// ws instance property, mirrors the static WebSocket.OPEN = 1
		OPEN: WebSocket.OPEN,
	} as unknown as WebSocket;
}

describe("WsGateway", () => {
	let gateway: WsGateway;

	beforeEach(() => {
		gateway = new WsGateway();
	});

	describe("handleSubscribe", () => {
		it("adds the client to the subscriptions map with the given agentId", () => {
			const ws = makeFakeWs();
			gateway.handleSubscribe(ws, "agent-1");

			gateway.notifyAgentSubscribers("agent-1", { type: "ping" });
			expect(ws.send).toHaveBeenCalledTimes(1);
			expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ping" }));
		});

		it("overwrites a previous subscription for the same client", () => {
			const ws = makeFakeWs();
			gateway.handleSubscribe(ws, "agent-1");
			gateway.handleSubscribe(ws, "agent-2");

			gateway.notifyAgentSubscribers("agent-1", { type: "ping" });
			expect(ws.send).not.toHaveBeenCalled();

			gateway.notifyAgentSubscribers("agent-2", { type: "ping" });
			expect(ws.send).toHaveBeenCalledTimes(1);
		});
	});

	describe("handleUnsubscribe", () => {
		it("removes the client so it no longer receives notifications", () => {
			const ws = makeFakeWs();
			gateway.handleSubscribe(ws, "agent-1");
			gateway.handleUnsubscribe(ws);

			gateway.notifyAgentSubscribers("agent-1", { type: "ping" });
			expect(ws.send).not.toHaveBeenCalled();
		});

		it("does not throw when the client was never subscribed", () => {
			const ws = makeFakeWs();
			expect(() => gateway.handleUnsubscribe(ws)).not.toThrow();
		});
	});

	describe("handleDisconnect", () => {
		it("removes the subscription on disconnect", () => {
			const ws = makeFakeWs();
			gateway.handleSubscribe(ws, "agent-1");
			gateway.handleDisconnect(ws);

			gateway.notifyAgentSubscribers("agent-1", { type: "ping" });
			expect(ws.send).not.toHaveBeenCalled();
		});
	});

	describe("notifyAgentSubscribers", () => {
		it("sends only to clients subscribed to the target agentId", () => {
			const ws1 = makeFakeWs();
			const ws2 = makeFakeWs();
			gateway.handleSubscribe(ws1, "agent-1");
			gateway.handleSubscribe(ws2, "agent-2");

			gateway.notifyAgentSubscribers("agent-1", { type: "frame" });

			expect(ws1.send).toHaveBeenCalledTimes(1);
			expect(ws2.send).not.toHaveBeenCalled();
		});

		it("serialises the event to JSON before sending", () => {
			const ws = makeFakeWs();
			gateway.handleSubscribe(ws, "agent-1");
			const event = { type: "agent_online", agentId: "agent-1" };

			gateway.notifyAgentSubscribers("agent-1", event);

			expect(ws.send).toHaveBeenCalledWith(JSON.stringify(event));
		});

		it("skips clients whose socket is not in OPEN state", () => {
			const wsOpen = makeFakeWs(WebSocket.OPEN);
			const wsClosed = makeFakeWs(WebSocket.CLOSED);
			const wsConnecting = makeFakeWs(WebSocket.CONNECTING);

			gateway.handleSubscribe(wsOpen, "agent-1");
			gateway.handleSubscribe(wsClosed, "agent-1");
			gateway.handleSubscribe(wsConnecting, "agent-1");

			gateway.notifyAgentSubscribers("agent-1", { type: "ping" });

			expect(wsOpen.send).toHaveBeenCalledTimes(1);
			expect(wsClosed.send).not.toHaveBeenCalled();
			expect(wsConnecting.send).not.toHaveBeenCalled();
		});

		it("does nothing when there are no subscribers for the agentId", () => {
			// Should not throw on an empty or non-matching map
			expect(() =>
				gateway.notifyAgentSubscribers("unknown-agent", { type: "ping" }),
			).not.toThrow();
		});
	});
});
