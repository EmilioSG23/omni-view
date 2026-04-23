import { CameraIcon } from "@/icons/CameraIcon";
import { KeyboardIcon } from "@/icons/KeyboardIcon";
import { MouseIcon } from "@/icons/MouseIcon";
import { VolumeIcon } from "@/icons/VolumeIcon";
import { RemoteInputFeature } from "@omni-view/shared";
import { ComponentType, SVGProps } from "react";

export const controlCards: Array<{
	feature: RemoteInputFeature;
	title: string;
	description: string;
	Icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
	available?: boolean;
}> = [
	{
		feature: "keyboard",
		title: "Keyboard",
		description: "Allow keydown and keyup events from the viewer.",
		Icon: KeyboardIcon,
	},
	{
		feature: "mouse",
		title: "Mouse",
		description: "Allow pointer movement, clicks and wheel events.",
		Icon: MouseIcon,
	},
	{
		feature: "audio",
		title: "Audio send",
		description: "Gate outbound audio tracks while capture stays live.",
		Icon: VolumeIcon,
		available: true,
	},
	{
		feature: "video",
		title: "Video send",
		description: "Gate outbound video tracks without stopping the session.",
		Icon: CameraIcon,
		available: true,
	},
];
