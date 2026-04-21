import type {
	IceCandidatePayload,
	SdpDescription,
	WebRtcAnswerPayload,
	WebRtcIcePayload,
	WebRtcOfferPayload,
} from "@omni-view/shared";
import { IsBoolean, IsNotEmpty, IsObject, IsString, Length } from "class-validator";

export class WebRtcOfferDto implements WebRtcOfferPayload {
	@IsString()
	@Length(1, 128)
	agentId!: string;

	@IsString()
	@Length(1, 128)
	viewerId!: string;

	@IsObject()
	@IsNotEmpty()
	sdp!: SdpDescription;
}

export class WebRtcAnswerDto implements WebRtcAnswerPayload {
	@IsString()
	@Length(1, 128)
	agentId!: string;

	@IsString()
	@Length(1, 128)
	viewerId!: string;

	@IsObject()
	@IsNotEmpty()
	sdp!: SdpDescription;
}

export class WebRtcIceDto implements WebRtcIcePayload {
	@IsString()
	@Length(1, 128)
	agentId!: string;

	@IsString()
	@Length(1, 128)
	viewerId!: string;

	@IsNotEmpty()
	candidate!: IceCandidatePayload;

	@IsBoolean()
	fromHost!: boolean;
}
