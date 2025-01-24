import * as vscode from 'vscode';
import { extContext, dataStor } from './extension';

export const RECENT_CONN_KEY = "recentConnDetails";
export const CONNMGR_DATA_GENID_KEY = "connectionDataGenId";

const CONNDATA_FILENAME = "remotes.json";
const CONNMGR_DATA_KEY_LEGACY = "connectionData";

// internal data versioning
const CONNMGR_DATA_VERSION_KEY = "version";
const CURR_CONNMGR_DATA_VERSION = 2;

const labelRe = /^[\w\-\. ]+$/;
const tokenRe = /^[\w\-]+$/;
const addressRe = /^([\w\-\.]+|\[[\da-fA-F:]+\])(:\d{1,5})(:[^:]+)?$/;

// vscode's file accessor for extension
const wsfs = vscode.workspace.fs;

// caching for getConnData
let currGenId: number = -1;
let connDataFilePath: vscode.Uri | undefined;
let currConnData: ContainerInfo;

export class RemoteInfo {
	public readonly displayLabel: string;
	public readonly description: string;
	public readonly authority: string;
	public readonly fullAuthority: string;

	constructor(
		public readonly host: string,
		public readonly port: number,
		public readonly label?: string,
		public readonly connectionToken?: string
	) {
		const fullAuthComp: string[] = ["tcpreh"];
		if (host.indexOf(":") >= 0) {
			// IPv6 address
			host = `[${host}]`;
		}
		this.description = this.displayLabel = this.authority = [host, port].join(":");
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
		if (!label) return;
		if (!labelRe.test(label)) {
			throw new Error("Invalid label. Label must consist of \
				alphanumerical, space, dash, or dot characters only")
		}
	}

	static checkTokenValid(token: string | undefined | null) {
		if (!token) return;
		if (!tokenRe.test(token)) {
			throw new Error("Invalid token. Tokens can only consist of \
				alphanumerical or dash characters only")
		}
	}

	static fromJSON(obj: any): RemoteInfo {
		return new RemoteInfo(obj.host, obj.port, obj.label, obj.connectionToken);
	}

	static fromAddress(address: string, label?: string): RemoteInfo {
		if (/(^\s|\s$)/.test(address)) {
			throw new Error("Blank spaces are not allowed");
		}
		const match = address.match(addressRe);
		if (!match) {
			throw new Error("Invalid address specification");
		}
		let host: string;
		let port: string;
		let connectionToken: string | undefined;
		[, host, port, connectionToken] = match;

		if (host.charAt(0) === '[') {
			// IPv6 address
			host = host.slice(1, -1);
		}

		const portNum = parseInt(port.substring(1));
		if (Number.isNaN(portNum) || portNum < 1 || portNum > 0xFFFF) {
			throw new Error("Invalid port number");
		}

		if (connectionToken) {
			// remove the leading ':'
			connectionToken = connectionToken.slice(1);
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
 * Input validators
 */

export function validateRemoteInput(value: string): string | undefined {
	if (!value) {
		return "Empty remote";
	}
	try {
		RemoteInfo.fromAddress(value);
		return;
	} catch (err) {
		return err.message;
	}
}

export function validateLabel(label: string): string | undefined {
	try {
		RemoteInfo.checkLabelValid(label);
		return;
	} catch (err) {
		return err.message;
	}
}

/**
 * Manage storage of connection data in globalStoragePath/remotes.json
 */
function populateConnDataFilePath() {
	if (!connDataFilePath) {
		connDataFilePath = vscode.Uri.joinPath(extContext.globalStorageUri, CONNDATA_FILENAME);
	}
}

async function readConnData(): Promise<ContainerInfo> {
	populateConnDataFilePath();
	let strData: string;
	try {
		const rawData = await wsfs.readFile(connDataFilePath!);
		strData = new TextDecoder().decode(rawData);
	} catch (err) {
		console.error(`Error loading remote data: ${err}`);
		strData = "";
	}
	return strData.length ? ContainerInfo.fromJSON(JSON.parse(strData)) : new ContainerInfo();
}

async function writeConnData(connData: ContainerInfo): Promise<any> {
	populateConnDataFilePath();
	const rawData = new TextEncoder().encode(JSON.stringify(connData));
	await wsfs.writeFile(connDataFilePath!, rawData);
}

/**
 * Call this function to sync the in-memory storage to the underlying storage
 */
export async function updateConnData() {
	const genId = dataStor.get<number>(CONNMGR_DATA_GENID_KEY, 0);
	currGenId = (genId + 1) % 0xFFFF;
	await dataStor.update(CONNMGR_DATA_GENID_KEY, currGenId);
	await writeConnData(currConnData);
}

export async function getConnData(): Promise<ContainerInfo> {
	const gsGenId = dataStor.get<number>(CONNMGR_DATA_GENID_KEY, 0);
	if (currConnData === undefined || gsGenId !== currGenId) {
		currConnData = await readConnData();
		await maybeAssignRootDirectory();
		currGenId = gsGenId;
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
	const dataVer = dataStor.get<number>(CONNMGR_DATA_VERSION_KEY);
	if (dataVer === undefined) {
		// initialize with a new blank settings instead
		await dataStor.update(CONNMGR_DATA_VERSION_KEY, CURR_CONNMGR_DATA_VERSION);
		return;
	}

	if (dataVer > CURR_CONNMGR_DATA_VERSION) {
		console.error(`Stored data version ${dataVer} is unsupported.`);
		return;
	}

	switch (dataVer) {
		case 0:
			await connDataUpgrade0();
		case 1:
			await connDataUpgrade1();
			break;
	}
}

async function maybeAssignRootDirectory() {
	if (!currConnData.directories.has("root")) {
		currConnData.directories.set("root", new DirectoryInfo("root"));
		await updateConnData();
	}
}

async function connDataUpgrade0() {
	// upgrade from version 0 to 1
	console.warn("Upgrading data version 0 to 1 ...");
	const oldRemotes = dataStor.get<any[]>(CONNMGR_DATA_KEY_LEGACY, []);

	currConnData = new ContainerInfo();
	for (const remote of oldRemotes) {
		const newRemote = new RemoteInfo(remote.host, remote.port, remote.label, remote.connectionToken);
		currConnData.remotes.set(genId("remote", currConnData), newRemote);
	}

	const rootDir = new DirectoryInfo("root", undefined, [...currConnData.remotes.keys()]);
	currConnData.directories.set("root", rootDir);

	await dataStor.update(CONNMGR_DATA_VERSION_KEY, 1);
	await dataStor.update(CONNMGR_DATA_KEY_LEGACY, currConnData);
}

async function connDataUpgrade1() {
	// upgrade from version 1 to 2
	console.warn("Upgrading data version 1 to 2 ...");
	currConnData = dataStor.get<any>(CONNMGR_DATA_KEY_LEGACY);
	if (currConnData) {
		await writeConnData(ContainerInfo.fromJSON(currConnData));
	} else {
		currConnData = new ContainerInfo();
	}
	await dataStor.update(CONNMGR_DATA_VERSION_KEY, 2);
}
