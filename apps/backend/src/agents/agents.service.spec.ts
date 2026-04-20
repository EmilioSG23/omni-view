import { NotFoundException } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Test, TestingModule } from "@nestjs/testing";
import { AgentsService } from "./agents.service";
import { AgentEntity } from "./agent.entity";
import { WhitelistEntity } from "./whitelist.entity";

// ---------------------------------------------------------------------------
// Minimal repository mock factory
// ---------------------------------------------------------------------------
function mockRepo<T extends object>(partialEntity: Partial<T> = {}) {
	return {
		findOne: jest.fn(),
		find: jest.fn(),
		save: jest.fn(),
		create: jest.fn((dto: Partial<T>) => ({ ...partialEntity, ...dto }) as T),
		remove: jest.fn(),
	};
}

describe("AgentsService", () => {
	let service: AgentsService;
	let agentsRepo: ReturnType<typeof mockRepo<AgentEntity>>;
	let whitelistRepo: ReturnType<typeof mockRepo<WhitelistEntity>>;

	beforeEach(async () => {
		agentsRepo = mockRepo<AgentEntity>();
		whitelistRepo = mockRepo<WhitelistEntity>();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AgentsService,
				{ provide: getRepositoryToken(AgentEntity), useValue: agentsRepo },
				{ provide: getRepositoryToken(WhitelistEntity), useValue: whitelistRepo },
			],
		}).compile();

		service = module.get(AgentsService);
	});

	// -------------------------------------------------------------------------
	// register
	// -------------------------------------------------------------------------

	describe("register", () => {
		it("creates a new agent when none exists", async () => {
			agentsRepo.findOne.mockResolvedValue(null);
			const saved = { agent_id: "uuid-1", version: "1.0.0", label: null } as AgentEntity;
			agentsRepo.save.mockResolvedValue(saved);

			const result = await service.register({ agent_id: "uuid-1", version: "1.0.0" });

			expect(agentsRepo.findOne).toHaveBeenCalledWith({ where: { agent_id: "uuid-1" } });
			expect(agentsRepo.save).toHaveBeenCalled();
			expect(result).toBe(saved);
		});

		it("updates an existing agent's version", async () => {
			const existing = {
				agent_id: "uuid-1",
				version: "0.9.0",
				label: "my-pc",
			} as AgentEntity;
			agentsRepo.findOne.mockResolvedValue(existing);
			agentsRepo.save.mockImplementation(async (e) => e);

			const result = await service.register({ agent_id: "uuid-1", version: "1.0.0" });

			expect(result.version).toBe("1.0.0");
			expect(agentsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ version: "1.0.0" }));
		});

		it("updates ws_url when provided", async () => {
			const existing = { agent_id: "uuid-1", version: "1.0", ws_url: null } as AgentEntity;
			agentsRepo.findOne.mockResolvedValue(existing);
			agentsRepo.save.mockImplementation(async (e) => e);

			const result = await service.register({
				agent_id: "uuid-1",
				version: "1.0",
				ws_url: "ws://localhost:9000",
			});

			expect(result.ws_url).toBe("ws://localhost:9000");
		});
	});

	// -------------------------------------------------------------------------
	// getConnectionInfo
	// -------------------------------------------------------------------------

	describe("getConnectionInfo", () => {
		it("returns ws_url and password_hash when both present", async () => {
			agentsRepo.findOne.mockResolvedValue({
				agent_id: "uuid-1",
				ws_url: "ws://localhost:9000",
				password_hash: "abc123",
			} as AgentEntity);

			const info = await service.getConnectionInfo("uuid-1");

			expect(info.ws_url).toBe("ws://localhost:9000");
			expect(info.password_hash).toBe("abc123");
		});

		it("throws NotFoundException when ws_url is missing", async () => {
			agentsRepo.findOne.mockResolvedValue({
				agent_id: "uuid-1",
				ws_url: null,
				password_hash: "abc123",
			} as AgentEntity);

			await expect(service.getConnectionInfo("uuid-1")).rejects.toThrow(NotFoundException);
		});

		it("throws NotFoundException when password_hash is missing", async () => {
			agentsRepo.findOne.mockResolvedValue({
				agent_id: "uuid-1",
				ws_url: "ws://localhost:9000",
				password_hash: null,
			} as AgentEntity);

			await expect(service.getConnectionInfo("uuid-1")).rejects.toThrow(NotFoundException);
		});

		it("throws NotFoundException when agent does not exist", async () => {
			agentsRepo.findOne.mockResolvedValue(null);

			await expect(service.getConnectionInfo("no-such-id")).rejects.toThrow(NotFoundException);
		});
	});

	// -------------------------------------------------------------------------
	// heartbeat
	// -------------------------------------------------------------------------

	describe("heartbeat", () => {
		it("saves the agent to update last_seen_at", async () => {
			const agent = { agent_id: "uuid-1", version: "1.0" } as AgentEntity;
			agentsRepo.findOne.mockResolvedValue(agent);
			agentsRepo.save.mockResolvedValue(agent);

			await service.heartbeat("uuid-1");

			expect(agentsRepo.save).toHaveBeenCalledWith(agent);
		});

		it("throws NotFoundException for unknown agent", async () => {
			agentsRepo.findOne.mockResolvedValue(null);

			await expect(service.heartbeat("ghost")).rejects.toThrow(NotFoundException);
		});
	});

	// -------------------------------------------------------------------------
	// findAll / findOne
	// -------------------------------------------------------------------------

	describe("findAll", () => {
		it("delegates to repository find()", async () => {
			const agents = [{ agent_id: "a" }, { agent_id: "b" }] as AgentEntity[];
			agentsRepo.find.mockResolvedValue(agents);

			const result = await service.findAll();

			expect(result).toBe(agents);
			expect(agentsRepo.find).toHaveBeenCalled();
		});
	});

	describe("findOne", () => {
		it("returns agent when found", async () => {
			const agent = { agent_id: "uuid-1" } as AgentEntity;
			agentsRepo.findOne.mockResolvedValue(agent);

			const result = await service.findOne("uuid-1");

			expect(result).toBe(agent);
		});

		it("throws NotFoundException when not found", async () => {
			agentsRepo.findOne.mockResolvedValue(null);

			await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
		});
	});

	// -------------------------------------------------------------------------
	// Whitelist
	// -------------------------------------------------------------------------

	describe("addToWhitelist", () => {
		it("returns existing entry if device already whitelisted", async () => {
			const agent = { agent_id: "uuid-1" } as AgentEntity;
			const existing = { agent_id: "uuid-1", device_id: "dev-1" } as WhitelistEntity;
			agentsRepo.findOne.mockResolvedValue(agent);
			whitelistRepo.findOne.mockResolvedValue(existing);

			const result = await service.addToWhitelist("uuid-1", { device_id: "dev-1" });

			expect(result).toBe(existing);
			expect(whitelistRepo.save).not.toHaveBeenCalled();
		});

		it("creates a new whitelist entry when device not present", async () => {
			const agent = { agent_id: "uuid-1" } as AgentEntity;
			const saved = { agent_id: "uuid-1", device_id: "dev-2" } as WhitelistEntity;
			agentsRepo.findOne.mockResolvedValue(agent);
			whitelistRepo.findOne.mockResolvedValue(null);
			whitelistRepo.save.mockResolvedValue(saved);

			const result = await service.addToWhitelist("uuid-1", { device_id: "dev-2" });

			expect(whitelistRepo.save).toHaveBeenCalled();
			expect(result).toBe(saved);
		});
	});

	describe("removeFromWhitelist", () => {
		it("removes the entry when found", async () => {
			const agent = { agent_id: "uuid-1" } as AgentEntity;
			const entry = { agent_id: "uuid-1", device_id: "dev-1" } as WhitelistEntity;
			agentsRepo.findOne.mockResolvedValue(agent);
			whitelistRepo.findOne.mockResolvedValue(entry);
			whitelistRepo.remove.mockResolvedValue(entry);

			await service.removeFromWhitelist("uuid-1", "dev-1");

			expect(whitelistRepo.remove).toHaveBeenCalledWith(entry);
		});

		it("throws NotFoundException when entry not found", async () => {
			agentsRepo.findOne.mockResolvedValue({ agent_id: "uuid-1" } as AgentEntity);
			whitelistRepo.findOne.mockResolvedValue(null);

			await expect(service.removeFromWhitelist("uuid-1", "no-device")).rejects.toThrow(
				NotFoundException,
			);
		});
	});
});
