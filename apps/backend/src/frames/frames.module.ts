import { FrameEntity } from "@/frames/frame.entity";
import { FramesService } from "@/frames/frames.service";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

@Module({
	imports: [TypeOrmModule.forFeature([FrameEntity])],
	providers: [FramesService],
	exports: [FramesService],
})
export class FramesModule {}
