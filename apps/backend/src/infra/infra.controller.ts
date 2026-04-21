import { InfraService } from "@/infra/infra.service";
import { Controller, Get, Query } from "@nestjs/common";

@Controller("infra")
export class InfraController {
	constructor(private readonly infraService: InfraService) {}

	/**
	 * GET /api/infra/ice-servers
	 * Optional query: ?viewerId=<id>
	 */
	@Get("ice-servers")
	getIceServers(@Query("viewerId") viewerId?: string) {
		const iceServers = this.infraService.getIceServers(viewerId);
		return { iceServers };
	}
}
