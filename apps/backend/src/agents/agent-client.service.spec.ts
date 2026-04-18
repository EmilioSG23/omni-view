import { AgentClientService } from "./agent-client.service";
import { WsGateway } from "../ws/ws.gateway";
import { FramesService } from "../frames/frames.service";
import WebSocket from "ws";

jest.mock("ws");

const MockWebSocket = WebSocket as jest.MockedClass<typeof WebSocket>;

/** Build a mock WsGateway with all methods as jest.fn() */
function makeGatewayMock(): jest.Mocked<WsGateway> {
	return {
		notifyAgentSubscribers: jest.fn(),
		handleSubscribe: jest.fn(),
		handleUnsubscribe: jest.fn(),
		handleConnection: jest.fn(),
		handleDisconnect: jest.fn(),
	} as unknown as jest.Mocked<WsGateway>;
}

/** Build a mock FramesService */
function makeFramesServiceMock(): jest.Mocked<FramesService> {
	return { save: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<FramesService>;
}

/** Creates a fake WS instance and exposes captured event listeners */
function makeFakeWsInstance() {
	const handlers: Record<string, (...args: unknown[]) => void> = {};
	const instance = {
		on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
			handlers[event] = handler;
		}),
		send: jest.fn(),
		close: jest.fn(),
		readyState: WebSocket.OPEN,
	} as unknown as WebSocket;
	return { instance, handlers };
}

describe("AgentClientService", () => {
	let service: AgentClientService;
	let gateway: jest.Mocked<WsGateway>;
	let framesService: jest.Mocked<FramesService>;

	beforeEach(() => {
		jest.clearAllMocks();
		gateway = makeGatewayMock();
		framesService = makeFramesServiceMock();
		service = new AgentClientService(framesService, gateway);
	});

	describe("connect", () => {
		it("opens a WebSocket to the given URL", () => {
			const { instance } = makeFakeWsInstance();
			MockWebSocket.mockReturnValueOnce(instance);

			service.connect("agent-1", "ws://localhost:9000", "password");

			expect(MockWebSocket).toHaveBeenCalledWith("ws://localhost:9000");
		});

		it("sends an auth message when the socket opens", () => {
			const { instance, handlers } = makeFakeWsInstance();
			MockWebSocket.mockReturnValueOnce(instance);

			service.connect("agent-1", "ws://localhost:9000", "secret");
			handlers["open"]?.();

			expect(instance.send).toHaveBeenCalledWith(
				JSON.stringify({ type: "auth", password: "secret" }),
			);
		});

		it("ignores duplicate connect calls for the same agentId", () => {
			const { instance } = makeFakeWsInstance();
			MockWebSocket.mockReturnValue(instance);

			service.connect("agent-1", "ws://localhost:9000", "pw");
			service.connect("agent-1", "ws://localhost:9001", "pw");

			// Constructor should only have been called once
			expect(MockWebSocket).toHaveBeenCalledTimes(1);
		});
	});

	describe("handleControl — auth_ok", () => {
		it("marks the session as connected and notifies the gateway", () => {
			const { instance, handlers } = makeFakeWsInstance();
			MockWebSocket.mockReturnValueOnce(instance);

			service.connect("agent-1", "ws://localhost:9000", "pw");
			handlers["open"]?.();

			// Simulate auth_ok response from agent
			const msg = Buffer.from(JSON.stringify({ type: "auth_ok" }));
			handlers["message"]?.(msg);

			expect(service.isConnected("agent-1")).toBe(true);
			expect(gateway.notifyAgentSubscribers).toHaveBeenCalledWith("agent-1", {
				type: "agent_online",
				agentId: "agent-1",
			});
		});
	});

	describe("handleControl — auth_error", () => {
		it("closes the socket and removes the session", () => {
			const { instance, handlers } = makeFakeWsInstance();
			MockWebSocket.mockReturnValueOnce(instance);

			service.connect("agent-1", "ws://localhost:9000", "bad-pw");
			handlers["open"]?.();

			const msg = Buffer.from(JSON.stringify({ type: "auth_error", reason: "invalid_password" }));
			handlers["message"]?.(msg);

			expect(instance.close).toHaveBeenCalledWith(1008, "auth_error");
			expect(service.isConnected("agent-1")).toBe(false);
		});
	});

	describe("handleControl — reinit", () => {
		it("forwards agent_reinit event to the gateway", () => {
			const { instance, handlers } = makeFakeWsInstance();
			MockWebSocket.mockReturnValueOnce(instance);

			service.connect("agent-1", "ws://localhost:9000", "pw");
			// Authenticate first
			handlers["open"]?.();
			handlers["message"]?.(Buffer.from(JSON.stringify({ type: "auth_ok" })));

			handlers["message"]?.(Buffer.from(JSON.stringify({ type: "reinit" })));

			expect(gateway.notifyAgentSubscribers).toHaveBeenCalledWith("agent-1", {
				type: "agent_reinit",
				agentId: "agent-1",
			});
		});
	});

	describe("disconnect", () => {
		it("closes the WebSocket and removes the session", () => {
			const { instance, handlers } = makeFakeWsInstance();
			MockWebSocket.mockReturnValueOnce(instance);

			service.connect("agent-1", "ws://localhost:9000", "pw");
			// Prevent automatic reconnect by overriding close handler
			handlers["close"] = () => {};

			service.disconnect("agent-1");

			expect(instance.close).toHaveBeenCalledWith(1000, "backend disconnect");
			expect(service.isConnected("agent-1")).toBe(false);
		});

		it("does not throw when called for an unknown agentId", () => {
			expect(() => service.disconnect("nonexistent")).not.toThrow();
		});
	});

	describe("isConnected", () => {
		it("returns false for an unknown agentId", () => {
			expect(service.isConnected("ghost")).toBe(false);
		});

		it("returns false before auth_ok is received", () => {
			const { instance } = makeFakeWsInstance();
			MockWebSocket.mockReturnValueOnce(instance);

			service.connect("agent-1", "ws://localhost:9000", "pw");

			expect(service.isConnected("agent-1")).toBe(false);
		});
	});

	describe("saveFrame — persistence disabled", () => {
		it("drops the frame and does not call FramesService when PERSIST_FRAMES is false", async () => {
			const originalEnv = process.env.PERSIST_FRAMES;
			process.env.PERSIST_FRAMES = "false";

			const { instance, handlers } = makeFakeWsInstance();
			MockWebSocket.mockReturnValueOnce(instance);

			service.connect("agent-1", "ws://localhost:9000", "pw");
			// Authenticate
			handlers["open"]?.();
			handlers["message"]?.(Buffer.from(JSON.stringify({ type: "auth_ok" })));

			// Send a binary frame
			const frame = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
			handlers["message"]?.(frame);

			// Allow any async saves to settle
			await Promise.resolve();

			expect(framesService.save).not.toHaveBeenCalled();

			process.env.PERSIST_FRAMES = originalEnv;
		});
	});
});
