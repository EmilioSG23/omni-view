import type { ViewerRequestPayload } from "@omni-view/shared";
import { IsOptional, IsString, Length } from "class-validator";

export class ViewerRequestDto implements ViewerRequestPayload {
	@IsString()
	@Length(1, 128)
	agentId!: string;

	@IsString()
	@Length(1, 128)
	viewerId!: string;

	/** Plain-text password — hashed server-side for comparison. */
	@IsString()
	password!: string;

	@IsOptional()
	@IsString()
	@Length(1, 64)
	label?: string;
}
