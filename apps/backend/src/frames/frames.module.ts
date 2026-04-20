import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FrameEntity } from "./frame.entity";
import { FramesService } from "./frames.service";

@Module({
	imports: [TypeOrmModule.forFeature([FrameEntity])],
	providers: [FramesService],
	exports: [FramesService],
})
export class FramesModule {}
