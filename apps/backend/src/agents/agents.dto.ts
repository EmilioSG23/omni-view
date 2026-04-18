import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class RegisterAgentDto {
	@IsUUID()
	agent_id!: string;

	@IsString()
	@IsOptional()
	label?: string;

	@IsString()
	@MinLength(1)
	version!: string;
}

export class AddToWhitelistDto {
	@IsString()
	@MinLength(1)
	device_id!: string;

	@IsString()
	@IsOptional()
	label?: string;
}

export class CheckWhitelistQueryDto {
	@IsString()
	@MinLength(1)
	device_id!: string;
}
