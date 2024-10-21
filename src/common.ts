import { dataStor } from './extension';

export const RECENT_CONN_KEY = "recentConnDetails";
export const CONNMGR_DATA_GENID_KEY = "connectionDataGenId";

const CONNMGR_DATA_KEY = "connectionData";

// internal data versioning
const CONNMGR_DATA_VERSION_KEY = "version";
const CURR_CONNMGR_DATA_VERSION = 1;

const labelRe = /^[a-zA-Z0-9\-\. ]+$/
const tokenRe = /^[a-zA-Z0-9\-]+$/

// caching for getConnData
let currGenId: number = -1;
let currConnData: ContainerInfo;

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
			RemoteInfo.checkLabelValid(label);
			fullAuthComp.push(label);
			this.displayLabel = label;
		}
		if (connectionToken) {
			RemoteInfo.checkTokenValid(connectionToken);
			this.authority = [this.authority, connectionToken].join(":")
		}
		fullAuthComp.push(this.authority);
		this.fullAuthority = fullAuthComp.join("+");
	}

	toJSON() {
		return {
			host: this.host,
			port: this.port,
			label: this.label,
			connectionToken: this.connectionToken
		}
	}

	static checkLabelValid(label: string | undefined | null) {
		if(!label) return;
		if (!labelRe.test(label)) {
			throw new Error("Invalid label. Label must consist of \
				alphanumerical, space, dash, or dot characters only.")
		}
	}

	static checkTokenValid(token: string | undefined | null) {
		if(!token) return;
		if (!tokenRe.test(token)) {
			throw new Error("Invalid token. Tokens can only consist of \
				alphanumerical or dash characters only.")
		}
	}

	static fromJSON(obj: any): RemoteInfo {
		return new RemoteInfo(obj.host, obj.port, obj.label, obj.connectionToken);
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

export class DirectoryInfo {
	public dirIds: string[] = [];
	public remoteIds: string[] = [];

	constructor(
		public label: string,
		dirIds: string[] | undefined = undefined,
		remoteIds: string[] | undefined = undefined
	) {
		if (Array.isArray(dirIds)) {
			this.dirIds = dirIds;
		}
		if (Array.isArray(remoteIds)) {
			this.remoteIds = remoteIds;
		}
	}

	static fromJSON(obj: any): DirectoryInfo {
		return new DirectoryInfo(obj.label, obj.dirIds, obj.remoteIds);
	}

	toJSON() {
		return {
			label: this.label,
			dirIds: this.dirIds,
			remoteIds: this.remoteIds
		}
	}

	get displayLabel(): string {
		// for interface consistency with RemoteInfo
		return this.label;
	}
}

export class ContainerInfo {
	public directories = new Map<string, DirectoryInfo>();
	public remotes = new Map<string, RemoteInfo>();

	static fromJSON(obj: any): ContainerInfo {
		const ret = new ContainerInfo();
		Object.entries(obj.directories).forEach(v => {
			ret.directories.set(v[0], DirectoryInfo.fromJSON(v[1]));
		});
		Object.entries(obj.remotes).forEach(v => {
			ret.remotes.set(v[0], RemoteInfo.fromJSON(v[1]));
		});
		return ret;
	}

	toJSON(): any {
		return {
			"directories": Object.fromEntries(this.directories),
			"remotes": Object.fromEntries(this.remotes)
		}
	}
}

/**
 * Call this function to sync the in-memory storage to the underlying Memento storage
 */
export async function updateConnData() {
	const genId = dataStor.get<number>(CONNMGR_DATA_GENID_KEY, 0);
	currGenId = (genId + 1) % 0xFFFF;
	await dataStor.update(CONNMGR_DATA_GENID_KEY, currGenId);
	await dataStor.update(CONNMGR_DATA_KEY, currConnData);
}

export function getConnData(): ContainerInfo {
	const gsGenId = dataStor.get<number>(CONNMGR_DATA_GENID_KEY, 0);
	if (currConnData === undefined || gsGenId !== currGenId) {
		const sData = dataStor.get<any>(CONNMGR_DATA_KEY);
		currConnData = sData ? ContainerInfo.fromJSON(sData) : new ContainerInfo();
	}
	return currConnData;
}

export function genId(kind: "dir" | "remote", contInfo: ContainerInfo = currConnData): string {
	const mapData: Map<string, any> = kind === "remote" ? contInfo.remotes : contInfo.directories;
	while (true) {
		let newId = kind.charAt(0);
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 12; ++i) {
			newId += characters.charAt(Math.random() * characters.length);
		}

		if (!mapData.has(newId)) {
			return newId;
		}
	}
}

export async function maybeUpgradeConnData() {
	const dataVer = dataStor.get<number>(CONNMGR_DATA_VERSION_KEY, 0);
	if (dataVer == CURR_CONNMGR_DATA_VERSION) {
		// perform sanitation only
		getConnData();
		if (!currConnData.directories.has("root")) {
			currConnData.directories.set("root", new DirectoryInfo("root"));
			await updateConnData();
		}
		return;
	} else if (dataVer > CURR_CONNMGR_DATA_VERSION) {
		console.error(`Stored data version ${dataVer} is unsupported.`);
		return;
	}

	// upgrade from version 0 to version 1
	const oldRemotes = dataStor.get<any[]>(CONNMGR_DATA_KEY, []);

	currConnData = new ContainerInfo();
	for (const remote of oldRemotes) {
		const newRemote = new RemoteInfo(remote.host, remote.port, remote.label, remote.connectionToken);
		currConnData.remotes.set(genId("remote", currConnData), newRemote);
	}

	const rootDir = new DirectoryInfo("root", undefined, [...currConnData.remotes.keys()]);
	currConnData.directories.set("root", rootDir);

	await dataStor.update(CONNMGR_DATA_VERSION_KEY, CURR_CONNMGR_DATA_VERSION);
	await updateConnData();
}
