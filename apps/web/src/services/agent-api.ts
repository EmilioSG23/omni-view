import type {
	AddToWhitelistDto,
	AgentStatusResponse,
	AgentSummary,
	CheckWhitelistResponse,
	ViewerInfo,
	WhitelistEntry,
} from "@omni-view/shared";
import { fetchJson } from "../core/fetch";

export const agentApi = {
	/** List all registered agents. */
	listAgents(): Promise<AgentSummary[]> {
		return fetchJson("/agents");
	},

	/** Get a single agent by ID. */
	getAgent(id: string): Promise<AgentSummary> {
		return fetchJson(`/agents/${encodeURIComponent(id)}`);
	},

	/** Check whether the agent's WebSocket is reachable. */
	getStatus(id: string): Promise<AgentStatusResponse> {
		return fetchJson(`/agents/${encodeURIComponent(id)}/status`);
	},

	/** Check if a device_id is on the agent's whitelist. */
	checkWhitelist(agentId: string, deviceId: string): Promise<CheckWhitelistResponse> {
		return fetchJson(
			`/agents/${encodeURIComponent(agentId)}/whitelist/check?device_id=${encodeURIComponent(deviceId)}`,
		);
	},

	/** Add a device to the agent's whitelist. */
	addToWhitelist(agentId: string, dto: AddToWhitelistDto): Promise<WhitelistEntry> {
		return fetchJson(`/agents/${encodeURIComponent(agentId)}/whitelist`, {
			method: "POST",
			body: JSON.stringify(dto),
		});
	},

	/**
	 * Register this browser device as an agent (or refresh its metadata).
	 * Used by the DevicePanel to announce the browser agent to the backend.
	 */
	registerSelf(dto: {
		agent_id: string;
		version: string;
		label?: string;
		capture_mode: string;
		password_hash?: string;
	}): Promise<{ agent_id: string; registered_at: string }> {
		return fetchJson("/agents/register", {
			method: "POST",
			body: JSON.stringify(dto),
		});
	},

	/** Update this agent's stored password hash. */
	updateAgent(
		agentId: string,
		dto: { password_hash?: string; label?: string },
	): Promise<AgentSummary> {
		return fetchJson(`/agents/${encodeURIComponent(agentId)}`, {
			method: "PATCH",
			body: JSON.stringify(dto),
		});
	},

	/** List viewers currently watching an agent via WebRTC. */
	listViewers(agentId: string): Promise<ViewerInfo[]> {
		return fetchJson(`/agents/${encodeURIComponent(agentId)}/viewers`);
	},

	/** Kick a viewer from an agent's WebRTC session. */
	kickViewer(agentId: string, viewerId: string): Promise<void> {
		return fetchJson(
			`/agents/${encodeURIComponent(agentId)}/viewers/${encodeURIComponent(viewerId)}`,
			{
				method: "DELETE",
			},
		);
	},
};
