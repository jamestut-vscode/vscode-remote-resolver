import { context } from './extension';

export const RECENT_CONN_KEY = "recentConnDetails";
export const CONNMGR_DATA_GENID_KEY = "connectionDataGenId";
export const CONNMGR_DATA_KEY = "connectionData";

export class RemoteInfo {
	public readonly displayLabel: string;
	public readonly authority: string;
	public readonly fullAuthority: string;

	constructor(
		public readonly host: string,
		public readonly port: number,
		public readonly label?: string,
		public readonly connectionToken?: string
	) {
		const fullAuthComp: string[] = ["tcpreh"];
		this.displayLabel = this.authority = [host, port].join(":");
		if (label) {
			fullAuthComp.push(label);
			this.displayLabel = label;
		}
		if (connectionToken) {
			this.authority = [this.authority, connectionToken].join(":")
		}
		fullAuthComp.push(this.authority);
		this.fullAuthority = fullAuthComp.join("+");
	}

	static fromAddress(address: string, label?: string): RemoteInfo {
		address = address.trim();
		if (!address.length) {
			throw new Error("Host is undefined");
		}
		const sa = address.split(":");
		if (sa.length < 2) {
			throw new Error("Port number is undefined");
		}

		let port: string;
		let host: string;
		let connectionToken: string | undefined;
		switch (sa.length) {
			case 2:
				[host, port] = sa;
				break;
			case 3:
				[host, port, connectionToken] = sa;
				break;
			default:
				// more than 3
				[port, connectionToken] = sa.slice(-2);
				host = sa.slice(0, -2).join(':');
				break;
		}

		const portNum = parseInt(port);
		if (Number.isNaN(portNum) || portNum < 1 || portNum > 0xFFFF) {
			throw new Error("Invalid port number");
		}
		return new RemoteInfo(host, portNum, label, connectionToken);
	}

	static fromFullAuthority(fullAuth: string): RemoteInfo {
		let protocol: string;
		let labelOrAddress: string | undefined;
		let address: string;
		[protocol, labelOrAddress, address] = fullAuth.split("+", 3);
		if (protocol != 'tcpreh') {
			throw new Error("Protocol is not 'tcpreh'");
		}
		if (!address) {
			address = labelOrAddress;
			labelOrAddress = undefined;
		}
		if (!address) {
			throw new Error("Unknown address");
		}
		return RemoteInfo.fromAddress(address, labelOrAddress);
	}
}

export function updateConnData(newData : RemoteInfo[]) {
    let genId = context.globalState.get<number>(CONNMGR_DATA_GENID_KEY, 0);
    genId = (genId + 1) % 0xFFFF;
    context.globalState.update(CONNMGR_DATA_GENID_KEY, genId);
    context.globalState.update(CONNMGR_DATA_KEY, newData);
}
