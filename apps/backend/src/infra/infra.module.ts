import { InfraController } from "@/infra/infra.controller";
import { InfraService } from "@/infra/infra.service";
import { Module } from "@nestjs/common";

@Module({
	providers: [InfraService],
	controllers: [InfraController],
	exports: [InfraService],
})
export class InfraModule {}
