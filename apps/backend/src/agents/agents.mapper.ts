import { AgentEntity } from "@/agents/agent.entity";
import { AgentSummaryDto } from "@/agents/agents.responses";

/** Maps an AgentEntity to the public AgentSummaryDto (no internal fields exposed). */
export function toAgentSummary(entity: AgentEntity): AgentSummaryDto {
	return {
		agent_id: entity.agent_id,
		label: entity.label,
		version: entity.version,
		ws_url: entity.ws_url,
		capture_mode: entity.capture_mode,
		registered_at: entity.registered_at.toISOString(),
		last_seen_at: entity.last_seen_at.toISOString(),
	};
}
