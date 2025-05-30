import * as vscode from 'vscode';
import * as tm from './transport/meta';
import { extContext, dataStor } from './extension';
import { encodeToBase36 } from './baseCoder';

export const RECENT_CONN_KEY = "recentConnDetails";
export const CONNMGR_DATA_GENID_KEY = "connectionDataGenId";

const CONNDATA_FILENAME = "remotes.json";

// internal data versioning
const CONNMGR_DATA_VERSION_KEY = "version";
const CURR_CONNMGR_DATA_VERSION = 3;

const labelRe = /^[\w\-\. ]+$/;
const tokenRe = /^[\w\-]+$/;

// vscode's file accessor for extension
const wsfs = vscode.workspace.fs;

// caching for getConnData
let currGenId: number = -1;
let connDataFilePath: vscode.Uri | undefined;
let currConnData: ContainerInfo;

export class RemoteInfo {
	public readonly displayLabel: string;
	// description is for display in remote selector
	// it consists of "protocol+addr spec", without label or token
	public readonly description: string;
	// resource label is for display in the status bar
	public readonly resourceLabel: string;
	// fullAuthority is for passing around to "vscode-remote://"
	public readonly fullAuthority: string;
	// address is for user input. It is "transportMethod+authorityPart"
	public readonly address: string;

	constructor(
		public readonly transport: tm.TransportMethod,
		public readonly transportinfo: tm.TransportInfo,
		public readonly label?: string,
		public readonly connectionToken?: string
	) {
		// "jra"+transport method+encoded(authorityPart)+connection token+label
		const fullAuthComp: string[] = ["jra", transport];
		// transport method+authorityPart+connection token
		const addressComp: string[] = [transport];

		addressComp.push(transportinfo.authorityPart);
		fullAuthComp.push(encodeToBase36(transportinfo.authorityPart));

		if (connectionToken !== undefined) {
			RemoteInfo.checkTokenValid(connectionToken);
			fullAuthComp.push(connectionToken);
			addressComp.push(connectionToken);
		} else {
			// empty string connection token for fullAuthority only (not address)
			fullAuthComp.push("");
		}

		// authorityPart only if unlabelled
		this.resourceLabel = transportinfo.authorityPart
		// transport method+authorityPart
		this.description = this.displayLabel =
			[transport, transportinfo.authorityPart].join("+");
		if (label) {
			RemoteInfo.checkLabelValid(label);
			fullAuthComp.push(label);
			this.resourceLabel = this.displayLabel = label;
		}

		this.fullAuthority = fullAuthComp.join("+");
		this.address = addressComp.join("+");
	}

	toJSON() {
		return {
			transport: this.transport,
			transportinfo: this.transportinfo,
			label: this.label,
			connectionToken: this.connectionToken
		}
	}

	static checkLabelValid(label: string | undefined) {
		if (label === undefined) return;
		if (!label.length) {
			throw new Error("Label is empty");
		}
		if (!labelRe.test(label)) {
			throw new Error("Invalid label. Label must consist of \
				alphanumerical, space, dash, or dot characters only")
		}
	}

	static checkTokenValid(token: string | undefined) {
		if (token === undefined) return;
		if (!token.length) {
			throw new Error("Token is empty");
		}
		if (!tokenRe.test(token)) {
			throw new Error("Invalid token. Tokens can only consist of \
				alphanumerical or dash characters only")
		}
	}

	static fromJSON(obj: any): RemoteInfo {
		let transportinfo: tm.TransportInfo;
		switch (obj.transport) {
			case tm.TransportMethod.TCP:
				transportinfo = tm.TcpTransportInfo.fromJSON(obj.transportinfo);
				break;
			case tm.TransportMethod.UDS:
				transportinfo = tm.UdsTransportInfo.fromJSON(obj.transportinfo);
				break;
			case tm.TransportMethod.PIPE:
				transportinfo = tm.PipeTransportInfo.fromJSON(obj.transportinfo);
				break;
			default:
				throw new Error("Transport method is not supported");
		}
		return new RemoteInfo(obj.transport, transportinfo, obj.label, obj.connectionToken);
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
 * Manage storage of connection data in globalStoragePath/remotes.json
 */
function populateConnDataFilePath() {
	if (!connDataFilePath) {
		connDataFilePath = vscode.Uri.joinPath(extContext.globalStorageUri, CONNDATA_FILENAME);
	}
}

async function readConnDataRaw(): Promise<string> {
	populateConnDataFilePath();
	let strData: string;
	try {
		const rawData = await wsfs.readFile(connDataFilePath!);
		strData = new TextDecoder().decode(rawData);
	} catch (err) {
		console.error(`Error loading remote data: ${err}`);
		strData = "";
	}
	return strData;
}

async function readConnData(): Promise<ContainerInfo> {
	const strData = await readConnDataRaw();
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

async function maybeAssignRootDirectory() {
	if (!currConnData.directories.has("root")) {
		currConnData.directories.set("root", new DirectoryInfo("root"));
		await updateConnData();
	}
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
	// version that we support upgrading from
	const MINIMUM_SUPPORTED_VERSION = 2;

	const dataVer = dataStor.get<number>(CONNMGR_DATA_VERSION_KEY);
	if (dataVer === undefined) {
		// initialize with a new blank settings instead
		await dataStor.update(CONNMGR_DATA_VERSION_KEY, CURR_CONNMGR_DATA_VERSION);
		return;
	}

	if (dataVer > CURR_CONNMGR_DATA_VERSION) {
		throw new Error(`Stored data version ${dataVer} is unsupported: ` +
			"it came from a newer version of this app.");
	}

	if (dataVer < MINIMUM_SUPPORTED_VERSION) {
		const rs = await vscode.window.showWarningMessage(
			"Data version is too old. " +
			"Click 'Yes' to reset data or 'No' to stop loading this extension.",
			"Yes", "No");
		if (rs === 'Yes') {
			dataStor.update(CONNMGR_DATA_VERSION_KEY, CURR_CONNMGR_DATA_VERSION);
			writeConnData(new ContainerInfo());
			return;
		} else {
			vscode.window.showInformationMessage(
				"Older version of this app can be used to upgrade to supported version. " +
				"See documentation or release notes for more details.");
			throw new Error("Data version is too old.");
		}
	}

	switch (dataVer) {
		case 2:
			await connDataUpgrade2();
			break;
	}
}

async function connDataUpgrade2() {
	// upgrade from version 2 to 3
	console.warn("Upgrading data version 2 to 3 ...");
	dataStor.update(CONNMGR_DATA_VERSION_KEY, 3);
	// more straightfoward to just remove the recent connection entry
	dataStor.update(RECENT_CONN_KEY, undefined);

	const strData = await readConnDataRaw();
	if (!strData.length) return;
	
	const jsonData = JSON.parse(strData);
	let remotes = jsonData.remotes as { [index: string]: any };
	for (const remoteId in remotes) {
		const remoteObj = remotes[remoteId];
		// old version always uses TCP
		remotes[remoteId] = {
			"transport": "tcp",
			"transportinfo": {
				"host": remoteObj.host,
				"port": remoteObj.port,
			},
			"label": remoteObj.label,
			"connectionToken": remoteObj.connectionToken
		}
	}

	await writeConnData(ContainerInfo.fromJSON(jsonData));
}
