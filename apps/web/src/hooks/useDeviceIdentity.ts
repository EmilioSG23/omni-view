import { getDeviceId } from "@/utils/device-identity";
import { useState } from "react";

/**
 * Returns this browser device's stable UUID, generating one on first use.
 * The value is persisted in localStorage and never changes for this browser profile.
 */
export function useDeviceIdentity(): string {
	const [deviceId] = useState<string>(() => getDeviceId());
	return deviceId;
}
