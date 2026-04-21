import { Injectable } from "@nestjs/common";
import { IceServer, STUN_ICE_SERVER } from "@omni-view/shared";
import { createHmac } from "crypto";

@Injectable()
export class InfraService {
	private readonly turnHost?: string;
	private readonly turnSecret?: string;
	private readonly turnTtl: number;

	constructor() {
		this.turnHost = process.env.TURN_HOST;
		this.turnSecret = process.env.TURN_SHARED_SECRET ?? process.env.TURN_STATIC_SECRET;
		this.turnTtl = Number(process.env.TURN_CREDENTIAL_TTL ?? "300");
	}

	/** Just for an own TURN server */
	private genTurnCred(subject: string) {
		const expiry = Math.floor(Date.now() / 1000) + this.turnTtl;
		const username = `${expiry}:${subject}`;
		const hmac = createHmac("sha1", this.turnSecret ?? "")
			.update(username)
			.digest("base64");
		return { username, credential: hmac, ttl: this.turnTtl };
	}

	/**
	 * Return an array of IceServer objects. If TURN is configured (TURN_HOST + TURN_SHARED_SECRET),
	 * generate short-lived credentials compatible with coturn `use-auth-secret`.
	 */
	getIceServers(viewerId?: string): IceServer[] {
		const base = [STUN_ICE_SERVER];

		if (!this.turnHost || !this.turnSecret) {
			return base;
		}

		const subject = viewerId ?? "anon";
		const creds = this.genTurnCred(subject);

		const turnServers: IceServer[] = [
			{
				urls: [
					`turn:${this.turnHost}:3478?transport=udp`,
					`turn:${this.turnHost}:3478?transport=tcp`,
				],
				username: creds.username,
				credential: creds.credential,
			},
		];

		return [...base, ...turnServers];
	}
}
