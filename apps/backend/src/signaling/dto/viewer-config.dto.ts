import { IsString, Length } from "class-validator";

export class ViewerConfigDto {
	@IsString()
	@Length(1, 128)
	agentId!: string;

	@IsString()
	@Length(1, 128)
	viewerId!: string;

	@IsString()
	@Length(1, 32)
	preset!: string;
}
