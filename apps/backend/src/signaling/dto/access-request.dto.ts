import type { AccessRequestPayload } from "@omni-view/shared";
import { IsOptional, IsString, Length } from "class-validator";

export class AccessRequestDto implements AccessRequestPayload {
	@IsString()
	@Length(1, 128)
	requestId!: string;

	@IsString()
	@Length(1, 128)
	agentId!: string;

	@IsString()
	@Length(1, 128)
	deviceId!: string;

	@IsOptional()
	@IsString()
	@Length(1, 64)
	label?: string;
}
