/**
 * E2E tests for the backend-pull agent connection flow.
 *
 * These tests start a real NestJS application bound to a random port and a
 * local WebSocket mock server that impersonates a live OmniView agent.  HTTP
 * requests are made with `supertest`; the mock WS server is created with the
 * `ws` package that is already a production dependency of the backend.
 *
 * Covered scenarios
 * -----------------
 * 1. POST /api/agents/:id/connect triggers a WS connection and sends `{ type: "auth", password }`
 * 2. Agent responds auth_ok → backend marks session as connected
 * 3. Agent responds auth_error → backend closes the socket, session is not connected
 * 4. DELETE /api/agents/:id/connect closes the existing WS session
 * 5. GET /api/agents/:id/status reflects the live connection state correctly
 * 6. Multiple simultaneous agent connections are managed independently
 */

import { AppModule } from "@/app.module";
import { hashPassword } from "@/common/utils/crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { randomUUID } from "node:crypto";
import WebSocket, { AddressInfo, Server as WsServer } from "ws";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start a NestJS app on a random port and return it plus the HTTP base URL. */
async function startApp(): Promise<{ app: INestApplication; baseUrl: string }> {
	const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
	app.useWebSocketAdapter(new WsAdapter(app));
	app.useGlobalPipes(
		new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
	);
	app.setGlobalPrefix("api");
	await app.listen(0); // OS-assigned port
	const url = await app.getUrl(); // e.g. http://127.0.0.1:PORT
	return { app, baseUrl: url };
}

/** Thin HTTP helper — uses native fetch available in Node 18+. */
const http = {
	async post(
		baseUrl: string,
		path: string,
		body?: unknown,
	): Promise<{ status: number; body: unknown }> {
		const res = await fetch(`${baseUrl}${path}`, {
			method: "POST",
			headers: body !== undefined ? { "Content-Type": "application/json" } : {},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
		const text = await res.text();
		return { status: res.status, body: text ? JSON.parse(text) : null };
	},
	async get(baseUrl: string, path: string): Promise<{ status: number; body: unknown }> {
		const res = await fetch(`${baseUrl}${path}`);
		const text = await res.text();
		return { status: res.status, body: text ? JSON.parse(text) : null };
	},
	async delete(baseUrl: string, path: string): Promise<{ status: number; body: unknown }> {
		const res = await fetch(`${baseUrl}${path}`, { method: "DELETE" });
		const text = await res.text();
		return { status: res.status, body: text ? JSON.parse(text) : null };
	},
};

interface MockAgentServer {
	server: WsServer;
	port: number;
	wsUrl: string;
	/** Messages received by the mock agent */
	received: unknown[];
	/** Send a message from the mock agent to the backend connection */
	sendTo: (agentId: string, data: unknown) => void;
	/** Close everything */
	close: () => Promise<void>;
}

/**
 * Start a WebSocket server that acts as a mock OmniView agent.
 * Each incoming connection is stored by the first JSON message type so tests
 * can reply appropriately.
 */
async function startMockAgent(): Promise<MockAgentServer> {
	const received: unknown[] = [];
	const sockets = new Map<string, WebSocket>();
	let resolveFirstMessage: ((msg: unknown) => void) | undefined;

	const server = new WsServer({ host: "127.0.0.1", port: 0 });

	await new Promise<void>((res) => server.once("listening", res));
	const port = (server.address() as AddressInfo).port;

	server.on("connection", (ws: WebSocket) => {
		ws.on("message", (raw: Buffer | string) => {
			try {
				const msg = JSON.parse(raw.toString());
				received.push(msg);
				// Store this socket indexed by agentId once we know it
				const type = (msg as { type?: string }).type;
				if (type === "auth") {
					// Temporarily store the socket with a placeholder key until the
					// test registers a proper agentId.
					sockets.set("__pending__", ws);
				}
				resolveFirstMessage?.(msg);
				resolveFirstMessage = undefined;
			} catch {
				// binary / non-JSON — ignored in these tests
			}
		});
	});

	return {
		server,
		port,
		wsUrl: `ws://127.0.0.1:${port}`,
		received,
		sendTo(_agentId: string, data: unknown) {
			const ws = sockets.get("__pending__");
			if (ws && ws.readyState === WebSocket.OPEN) {
				// 1 = OPEN
				ws.send(JSON.stringify(data));
			}
		},
		async close() {
			// Terminate all existing client connections so server.close() can complete immediately.
			// Without this, ws.Server.close() hangs indefinitely waiting for clients to disconnect.
			server.clients.forEach((client) => client.terminate());
			await new Promise<void>((res) => server.close(() => res()));
		},
	};
}

/** Wait until `condition()` is true (sync or async), polling every `intervalMs`. */
async function waitUntil(
	condition: () => boolean | Promise<boolean>,
	timeoutMs = 2000,
	intervalMs = 30,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await condition())) {
		if (Date.now() > deadline) throw new Error("waitUntil: timed out");
		await new Promise((r) => setTimeout(r, intervalMs));
	}
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("AgentClientService — backend-pull connection (e2e)", () => {
	let app: INestApplication;
	let baseUrl: string;

	// Use a unique DB per test run to avoid state leakage between suites.
	const testDbPath = `omniview-e2e-agent-${Date.now()}.db`;

	beforeAll(async () => {
		process.env.DB_PATH = testDbPath;
		({ app, baseUrl } = await startApp());
	});

	afterAll(async () => {
		await app.close();
		// Clean up the test database file (best-effort)
		try {
			const { unlink } = await import("fs/promises");
			await unlink(testDbPath);
		} catch {
			// ignore
		}
	});

	// -------------------------------------------------------------------------

	it("POST /connect triggers WS connection and backend sends auth message", async () => {
		const agentId = randomUUID();
		const password = "test_password_01";
		const passwordHash = hashPassword(password);

		const mock = await startMockAgent();

		// Register the agent so the backend has ws_url and password_hash
		const reg = await http.post(baseUrl, "/api/agents/register", {
			agent_id: agentId,
			version: "1.0.0",
			ws_url: mock.wsUrl,
			password_hash: passwordHash,
		});
		expect(reg.status).toBe(201);

		// Instruct backend to connect
		const conn = await http.post(baseUrl, `/api/agents/${agentId}/connect`);
		expect(conn.status).toBe(204);

		// Wait for the mock agent to receive the auth message
		await waitUntil(() => mock.received.length > 0);

		expect(mock.received[0]).toMatchObject({ type: "auth", password: passwordHash });

		await mock.close();
	});

	it("auth_ok response marks the session as connected", async () => {
		const agentId = randomUUID();
		const password = "test_password_02";
		const passwordHash = hashPassword(password);

		const mock = await startMockAgent();

		const reg = await http.post(baseUrl, "/api/agents/register", {
			agent_id: agentId,
			version: "1.0.0",
			ws_url: mock.wsUrl,
			password_hash: passwordHash,
		});
		expect(reg.status).toBe(201);

		const conn = await http.post(baseUrl, `/api/agents/${agentId}/connect`);
		expect(conn.status).toBe(204);

		// Wait for auth message then respond with auth_ok
		await waitUntil(() => mock.received.length > 0);
		mock.sendTo(agentId, { type: "auth_ok", agent_id: agentId });

		// Backend should now report connected
		await waitUntil(async () => {
			const r = await http.get(baseUrl, `/api/agents/${agentId}/status`);
			return (r.body as { connected: boolean }).connected === true;
		});

		const { body } = await http.get(baseUrl, `/api/agents/${agentId}/status`);
		expect((body as Record<string, unknown>).connected).toBe(true);
		expect((body as Record<string, unknown>).agentId).toBe(agentId);

		const del = await http.delete(baseUrl, `/api/agents/${agentId}/connect`);
		expect(del.status).toBe(204);
		await mock.close();
	});

	it("auth_error response leaves the session disconnected", async () => {
		const agentId = randomUUID();
		const passwordHash = hashPassword("test_password_03");

		const mock = await startMockAgent();

		const reg = await http.post(baseUrl, "/api/agents/register", {
			agent_id: agentId,
			version: "1.0.0",
			ws_url: mock.wsUrl,
			password_hash: passwordHash,
		});
		expect(reg.status).toBe(201);

		const conn = await http.post(baseUrl, `/api/agents/${agentId}/connect`);
		expect(conn.status).toBe(204);

		// Wait for auth message then respond with auth_error
		await waitUntil(() => mock.received.length > 0);
		mock.sendTo(agentId, { type: "auth_error", reason: "invalid_password" });

		// Backend closes the socket — status should remain disconnected
		await new Promise((r) => setTimeout(r, 200));

		const { body } = await http.get(baseUrl, `/api/agents/${agentId}/status`);
		expect((body as Record<string, unknown>).connected).toBe(false);

		await mock.close();
	});

	it("DELETE /connect closes the active session", async () => {
		const agentId = randomUUID();
		const passwordHash = hashPassword("test_password_04");

		const mock = await startMockAgent();

		const reg = await http.post(baseUrl, "/api/agents/register", {
			agent_id: agentId,
			version: "1.0.0",
			ws_url: mock.wsUrl,
			password_hash: passwordHash,
		});
		expect(reg.status).toBe(201);

		const conn = await http.post(baseUrl, `/api/agents/${agentId}/connect`);
		expect(conn.status).toBe(204);
		await waitUntil(() => mock.received.length > 0);
		mock.sendTo(agentId, { type: "auth_ok", agent_id: agentId });
		await waitUntil(async () => {
			const r = await http.get(baseUrl, `/api/agents/${agentId}/status`);
			return (r.body as { connected: boolean }).connected === true;
		});

		// Disconnect
		const del = await http.delete(baseUrl, `/api/agents/${agentId}/connect`);
		expect(del.status).toBe(204);

		const { body } = await http.get(baseUrl, `/api/agents/${agentId}/status`);
		expect((body as Record<string, unknown>).connected).toBe(false);

		await mock.close();
	});

	it("GET /status returns connected=false for an unknown agent", async () => {
		const { body } = await http.get(baseUrl, "/api/agents/non-existent-agent/status");
		expect((body as Record<string, unknown>).connected).toBe(false);
	});

	it("two agents can be connected simultaneously and are managed independently", async () => {
		const agentIdA = randomUUID();
		const agentIdB = randomUUID();
		const hashA = hashPassword("pw_a");
		const hashB = hashPassword("pw_b");

		const [mockA, mockB] = await Promise.all([startMockAgent(), startMockAgent()]);

		const [regA, regB] = await Promise.all([
			http.post(baseUrl, "/api/agents/register", {
				agent_id: agentIdA,
				version: "1.0.0",
				ws_url: mockA.wsUrl,
				password_hash: hashA,
			}),
			http.post(baseUrl, "/api/agents/register", {
				agent_id: agentIdB,
				version: "1.0.0",
				ws_url: mockB.wsUrl,
				password_hash: hashB,
			}),
		]);
		expect(regA.status).toBe(201);
		expect(regB.status).toBe(201);

		const [connA, connB] = await Promise.all([
			http.post(baseUrl, `/api/agents/${agentIdA}/connect`),
			http.post(baseUrl, `/api/agents/${agentIdB}/connect`),
		]);
		expect(connA.status).toBe(204);
		expect(connB.status).toBe(204);

		await waitUntil(() => mockA.received.length > 0 && mockB.received.length > 0);

		expect(mockA.received[0]).toMatchObject({ type: "auth" });
		expect(mockB.received[0]).toMatchObject({ type: "auth" });

		// Auth only A
		mockA.sendTo(agentIdA, { type: "auth_ok", agent_id: agentIdA });

		await waitUntil(async () => {
			const r = await http.get(baseUrl, `/api/agents/${agentIdA}/status`);
			return (r.body as { connected: boolean }).connected === true;
		});

		// B should still be disconnected
		const { body: bodyB } = await http.get(baseUrl, `/api/agents/${agentIdB}/status`);
		expect((bodyB as Record<string, unknown>).connected).toBe(false);

		// Cleanup
		const del = await http.delete(baseUrl, `/api/agents/${agentIdA}/connect`);
		expect(del.status).toBe(204);
		await Promise.all([mockA.close(), mockB.close()]);
	});
});
