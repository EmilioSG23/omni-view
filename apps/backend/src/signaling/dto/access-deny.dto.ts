import type { AccessDenyPayload } from "@omni-view/shared";
import { IsBoolean, IsOptional, IsString, Length } from "class-validator";

export class AccessDenyDto implements AccessDenyPayload {
	@IsString()
	@Length(1, 128)
	requestId!: string;

	@IsString()
	@Length(1, 128)
	agentId!: string;

	@IsOptional()
	@IsBoolean()
	blacklist?: boolean;
}
