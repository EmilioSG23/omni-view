import type { HostJoinPayload } from "@omni-view/shared";
import { IsString, Length } from "class-validator";

export class HostJoinDto implements HostJoinPayload {
	@IsString()
	@Length(1, 128)
	agentId!: string;

	@IsString()
	@Length(64, 64, { message: "passwordHash must be a 64-character hex SHA-256 digest" })
	passwordHash!: string;
}
