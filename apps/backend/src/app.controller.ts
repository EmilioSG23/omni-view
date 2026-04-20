import { AppService } from "@/app.service";
import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
	constructor(private readonly appService: AppService) {}

	@Get("/status")
	status(): { status: number; message: string } {
		return this.appService.status();
	}
}
