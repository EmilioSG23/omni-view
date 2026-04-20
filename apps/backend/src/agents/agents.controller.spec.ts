import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { WsGateway } from "../ws/ws.gateway";
import { AgentClientService } from "./agent-client.service";
import { AgentEntity } from "./agent.entity";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------
function mockAgentsService() {
	return {
		register: jest.fn(),
		findAll: jest.fn(),
		findOne: jest.fn(),
		heartbeat: jest.fn(),
		getConnectionInfo: jest.fn(),
		addToWhitelist: jest.fn(),
		removeFromWhitelist: jest.fn(),
		getWhitelist: jest.fn(),
		isWhitelisted: jest.fn(),
	} as unknown as jest.Mocked<AgentsService>;
}

function mockAgentClientService() {
	return {
		connect: jest.fn(),
		disconnect: jest.fn(),
		isConnected: jest.fn(),
	} as unknown as jest.Mocked<AgentClientService>;
}

describe("AgentsController", () => {
	let controller: AgentsController;
	let agentsService: jest.Mocked<AgentsService>;
	let agentClientService: jest.Mocked<AgentClientService>;

	beforeEach(async () => {
		agentsService = mockAgentsService();
		agentClientService = mockAgentClientService();

		const module: TestingModule = await Test.createTestingModule({
			controllers: [AgentsController],
			providers: [
				{ provide: AgentsService, useValue: agentsService },
				{ provide: AgentClientService, useValue: agentClientService },
				{ provide: WsGateway, useValue: { getViewers: jest.fn(), kickViewer: jest.fn() } },
			],
		}).compile();

		controller = module.get(AgentsController);
	});

	// -------------------------------------------------------------------------
	// register
	// -------------------------------------------------------------------------

	describe("register", () => {
		it("delegates to AgentsService.register and returns result", async () => {
			const saved = { agent_id: "uuid-1", version: "1.0.0" } as AgentEntity;
			agentsService.register.mockResolvedValue(saved);

			const result = await controller.register({ agent_id: "uuid-1", version: "1.0.0" });

			expect(agentsService.register).toHaveBeenCalledWith({ agent_id: "uuid-1", version: "1.0.0" });
			expect(result).toBe(saved);
		});
	});

	// -------------------------------------------------------------------------
	// findAll
	// -------------------------------------------------------------------------

	describe("findAll", () => {
		it("returns list from AgentsService.findAll", async () => {
			const agents = [{ agent_id: "a" }, { agent_id: "b" }] as AgentEntity[];
			agentsService.findAll.mockResolvedValue(agents);

			const result = await controller.findAll();

			expect(result).toBe(agents);
		});
	});

	// -------------------------------------------------------------------------
	// findOne
	// -------------------------------------------------------------------------

	describe("findOne", () => {
		it("returns agent for valid id", async () => {
			const agent = { agent_id: "uuid-1" } as AgentEntity;
			agentsService.findOne.mockResolvedValue(agent);

			const result = await controller.findOne("uuid-1");

			expect(result).toBe(agent);
		});

		it("propagates NotFoundException from service", async () => {
			agentsService.findOne.mockRejectedValue(new NotFoundException("not found"));

			await expect(controller.findOne("no-such-id")).rejects.toThrow(NotFoundException);
		});
	});

	// -------------------------------------------------------------------------
	// heartbeat
	// -------------------------------------------------------------------------

	describe("heartbeat", () => {
		it("calls AgentsService.heartbeat (returns void)", async () => {
			agentsService.heartbeat.mockResolvedValue(undefined);

			await expect(controller.heartbeat("uuid-1")).resolves.toBeUndefined();

			expect(agentsService.heartbeat).toHaveBeenCalledWith("uuid-1");
		});

		it("propagates NotFoundException for unknown agent", async () => {
			agentsService.heartbeat.mockRejectedValue(new NotFoundException());

			await expect(controller.heartbeat("ghost")).rejects.toThrow(NotFoundException);
		});
	});
});
