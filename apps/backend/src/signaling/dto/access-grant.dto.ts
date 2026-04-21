import type { AccessGrantPayload } from "@omni-view/shared";
import { IsString, Length } from "class-validator";

export class AccessGrantDto implements AccessGrantPayload {
	@IsString()
	@Length(1, 128)
	requestId!: string;

	@IsString()
	@Length(1, 128)
	agentId!: string;
}
