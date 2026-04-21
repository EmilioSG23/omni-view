export interface IceServer {
	urls: string | string[];
	username?: string;
	credential?: string;
}

export const STUN_ICE_SERVER: IceServer = {
	urls: "stun:stun.l.google.com:19302",
};
