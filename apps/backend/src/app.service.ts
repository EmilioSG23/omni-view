import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
	getHello(): { message: string } {
		return { message: "Welcome to OmniView API" };
	}
	status(): { status: number; message: string } {
		return { status: 200, message: "OK" };
	}
}
