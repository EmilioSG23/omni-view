/**
 * E2E tests for the WsGateway signaling multi-client scenarios.
 *
 * Each test starts the full NestJS application and connects real WebSocket
 * clients to the signaling endpoint (`/api/ws`).  No mock agent server is
 * needed here — we test that the gateway correctly routes notifications to
 * subscribed clients and ignores unsubscribed ones.
 *
 * Covered scenarios
 * -----------------
 * 1. A client that subscribes to an agentId receives notifications for that agent
 * 2. A client does NOT receive notifications for an agentId it did not subscribe to
 * 3. Multiple clients subscribed to the same agentId all receive the notification
 * 4. After unsubscribe, the client no longer receives notifications
 * 5. Disconnecting a client removes it from subscriptions automatically
 */

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import WebSocket from "ws";
import { AppModule } from "../src/app.module";
import { WsGateway } from "../src/ws/ws.gateway";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function startApp(): Promise<{ app: INestApplication; wsUrl: string }> {
	const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
	app.useWebSocketAdapter(new WsAdapter(app));
	app.useGlobalPipes(
		new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
	);
	app.setGlobalPrefix("api");
	await app.listen(0);
	const url = (await app.getUrl()).replace("http", "ws");
	return { app, wsUrl: url };
}

/** Open a WebSocket connection to the signaling gateway and wait until it is OPEN. */
async function connectClient(wsUrl: string): Promise<WebSocket> {
	const ws = new WebSocket(`${wsUrl}/api/ws`);
	await new Promise<void>((resolve, reject) => {
		(ws as NodeJS.EventEmitter).once("open", resolve);
		(ws as NodeJS.EventEmitter).once("error", reject);
	});
	return ws;
}

/** Send a JSON message over the WS connection in NestJS WS gateway format. */
function sendEvent(ws: WebSocket, event: string, data: unknown): void {
	(ws as unknown as { send(data: string): void }).send(JSON.stringify({ event, data }));
}

/** Collect the next `count` text messages from the WebSocket with an optional timeout. */
function collectMessages(ws: WebSocket, count: number, timeoutMs = 2000): Promise<unknown[]> {
	const emitter = ws as unknown as NodeJS.EventEmitter;
	return new Promise((resolve, reject) => {
		const messages: unknown[] = [];
		const timer = setTimeout(() => {
			reject(
				new Error(
					`collectMessages: timeout after ${timeoutMs}ms (got ${messages.length}/${count})`,
				),
			);
		}, timeoutMs);

		const handler = (raw: Buffer | string) => {
			try {
				messages.push(JSON.parse(raw.toString()));
			} catch {
				messages.push(raw.toString());
			}
			if (messages.length >= count) {
				clearTimeout(timer);
				emitter.off("message", handler);
				resolve(messages);
			}
		};
		emitter.on("message", handler);
	});
}

/** Promise that resolves if no message arrives within `waitMs`. */
function expectNoMessage(ws: WebSocket, waitMs = 300): Promise<void> {
	const emitter = ws as unknown as NodeJS.EventEmitter;
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, waitMs);
		const handler = (raw: Buffer | string) => {
			clearTimeout(timer);
			emitter.off("message", handler);
			reject(new Error(`Unexpected message received: ${raw.toString()}`));
		};
		emitter.once("message", handler);
	});
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("WsGateway — signaling multi-client (e2e)", () => {
	let app: INestApplication;
	let wsUrl: string;
	let gateway: WsGateway;

	const testDbPath = `omniview-e2e-ws-${Date.now()}.db`;

	beforeAll(async () => {
		process.env.DB_PATH = testDbPath;
		({ app, wsUrl } = await startApp());
		gateway = app.get(WsGateway);
	});

	afterAll(async () => {
		await app.close();
		try {
			const { unlink } = await import("fs/promises");
			await unlink(testDbPath);
		} catch {
			// ignore
		}
	});

	// -------------------------------------------------------------------------

	it("subscribed client receives notification for its agentId", async () => {
		const ws = await connectClient(wsUrl);
		const agentId = `ws-sub-${Date.now()}`;

		sendEvent(ws, "subscribe", agentId);

		// Give gateway time to register the subscription
		await new Promise((r) => setTimeout(r, 50));

		const messagesPromise = collectMessages(ws, 1);
		gateway.notifyAgentSubscribers(agentId, { type: "agent_online", agentId });

		const messages = await messagesPromise;
		expect(messages[0]).toMatchObject({ type: "agent_online", agentId });

		ws.close();
	});

	it("unsubscribed client does NOT receive notifications for other agents", async () => {
		const wsSubscribed = await connectClient(wsUrl);
		const wsOther = await connectClient(wsUrl);
		const agentId = `ws-nosub-${Date.now()}`;

		sendEvent(wsSubscribed, "subscribe", agentId);
		// wsOther subscribes to a different agentId
		sendEvent(wsOther, "subscribe", `other-agent-${Date.now()}`);

		await new Promise((r) => setTimeout(r, 50));

		const notExpected = expectNoMessage(wsOther, 300);
		gateway.notifyAgentSubscribers(agentId, { type: "agent_online", agentId });

		await notExpected; // passes only if no message arrives on wsOther

		wsSubscribed.close();
		wsOther.close();
	});

	it("multiple clients subscribed to the same agentId all receive the notification", async () => {
		const agentId = `ws-multi-${Date.now()}`;
		const clients = await Promise.all([
			connectClient(wsUrl),
			connectClient(wsUrl),
			connectClient(wsUrl),
		]);

		clients.forEach((ws) => sendEvent(ws, "subscribe", agentId));
		await new Promise((r) => setTimeout(r, 50));

		const promises = clients.map((ws) => collectMessages(ws, 1));
		gateway.notifyAgentSubscribers(agentId, { type: "agent_online", agentId });

		const results = await Promise.all(promises);
		results.forEach((msgs, i) => {
			expect(msgs[0]).toMatchObject(
				{ type: "agent_online", agentId },
				// @ts-ignore — jest matcher overload
				`client ${i} did not receive the notification`,
			);
		});

		clients.forEach((ws) => ws.close());
	});

	it("after unsubscribe the client no longer receives notifications", async () => {
		const ws = await connectClient(wsUrl);
		const agentId = `ws-unsub-${Date.now()}`;

		sendEvent(ws, "subscribe", agentId);
		await new Promise((r) => setTimeout(r, 50));

		// Verify subscription works first
		const firstMsg = collectMessages(ws, 1);
		gateway.notifyAgentSubscribers(agentId, { type: "agent_online", agentId });
		await firstMsg;

		// Unsubscribe
		sendEvent(ws, "unsubscribe", null);
		await new Promise((r) => setTimeout(r, 50));

		// Now no notification should arrive
		const noMsg = expectNoMessage(ws, 300);
		gateway.notifyAgentSubscribers(agentId, { type: "agent_offline", agentId });
		await noMsg;

		ws.close();
	});

	it("disconnecting a client removes it from subscriptions", async () => {
		const wsA = await connectClient(wsUrl);
		const wsB = await connectClient(wsUrl);
		const agentId = `ws-disc-${Date.now()}`;

		sendEvent(wsA, "subscribe", agentId);
		sendEvent(wsB, "subscribe", agentId);
		await new Promise((r) => setTimeout(r, 50));

		// Verify both get the notification
		const bothGet = Promise.all([collectMessages(wsA, 1), collectMessages(wsB, 1)]);
		gateway.notifyAgentSubscribers(agentId, { type: "agent_online", agentId });
		await bothGet;

		// Disconnect A
		wsA.close();
		await new Promise((r) => setTimeout(r, 100));

		// B should still get notifications
		const bGetsIt = collectMessages(wsB, 1);
		gateway.notifyAgentSubscribers(agentId, { type: "agent_reinit", agentId });
		const [msg] = await bGetsIt;
		expect(msg).toMatchObject({ type: "agent_reinit", agentId });

		wsB.close();
	});
});
