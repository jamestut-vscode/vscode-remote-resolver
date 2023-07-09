/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const RECENT_CONN_KEY = "recentConnDetails"
const CONNMGR_DATA_KEY = "connectionData"

class RemoteInfo {
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

export function activate(context: vscode.ExtensionContext) {
	// remote authority resolver
	function doResolve(authority: string): vscode.ResolvedAuthority {
		const remoteInfo = RemoteInfo.fromFullAuthority(authority);

		context.subscriptions.push(vscode.workspace.registerResourceLabelFormatter(
			{
				scheme: "vscode-remote",
				authority: "tcpreh+*",
				formatting: {
					label: "${path}",
					separator: "/",
					tildify: true,
					workspaceSuffix: `REH: ${remoteInfo.displayLabel}`,
					workspaceTooltip: "Remote Extension Host"
				}
			}
		));

		if (!remoteInfo.connectionToken) {
			console.log("No connection token specified.");
		}

		return new vscode.ResolvedAuthority(remoteInfo.host, remoteInfo.port, remoteInfo.connectionToken);
	}
	const authorityResolverDisposable = vscode.workspace.registerRemoteAuthorityResolver('tcpreh', {
		resolve(_authority: string): vscode.ResolvedAuthority {
			console.log("Calling doResolve ...");
			return doResolve(_authority);
		}
	});
	context.subscriptions.push(authorityResolverDisposable);

	// the command to manually connect to REH instance
	async function connectCommand(reuseWindow: boolean) {
		let recentConnInfo = context.globalState.get<RemoteInfo>(RECENT_CONN_KEY);
		const inputAddr = await vscode.window.showInputBox({
			title: "Enter remote target (only TCP is supported)",
			placeHolder: "hostname:port(:connectionToken)",
			value: recentConnInfo?.authority
		});
		if (!inputAddr)
			return;

		// check if supplied authority string is valid
		let currConnInfo = RemoteInfo.fromAddress(inputAddr);
		try {
			const remoteInfo = currConnInfo;
			context.globalState.update(RECENT_CONN_KEY, remoteInfo);
		} catch (err) {
			vscode.window.showErrorMessage(err.message);
			return;
		}

		return vscode.commands.executeCommand('vscode.newWindow',
			{ remoteAuthority: `tcpreh+${currConnInfo.authority}`, reuseWindow });
	}
	context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.newWindow', async () => {
		return await connectCommand(false);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.currentWindow', async () => {
		return await connectCommand(true);
	}));

	// remote manager view
	const remoteManagerDataProvider = new RemoteManagerDataProvider(context);
	vscode.window.registerTreeDataProvider('remoteResolverManagerView', remoteManagerDataProvider);

	// commands to add/edit/remove items from remote manager
	async function remoteManagerEditOrAdd(prefill?: RemoteInfo, editIndex?: number) {
		const inputAddr = await vscode.window.showInputBox({
			title: "Add remote address",
			placeHolder: "hostname:port(:connectionToken)",
			value: prefill?.authority
		});
		if (!inputAddr)
			return;

		let inputLabel = await vscode.window.showInputBox({
			title: "Enter nickname (optional)",
			placeHolder: "nickname",
			value: prefill?.label
		});
		if (inputLabel === undefined) {
			// user changed their mind while entering the nickname
			return;
		}
		if (!inputLabel)
			inputLabel = undefined;

		let connInfo: RemoteInfo;
		try {
			connInfo = RemoteInfo.fromAddress(inputAddr, inputLabel);
		} catch (err) {
			vscode.window.showErrorMessage(err.message);
			return;
		}

		let savedRemotes = context.globalState.get<RemoteInfo[]>(CONNMGR_DATA_KEY);
		if (!savedRemotes)
			savedRemotes = [];

		if (editIndex !== undefined) {
			savedRemotes[editIndex] = connInfo;
		} else {
			savedRemotes.push(connInfo);
		}
		context.globalState.update(CONNMGR_DATA_KEY, savedRemotes);

		remoteManagerDataProvider.refresh();
	}
	context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.add', () => {
		remoteManagerEditOrAdd();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.addRecent', () => {
		remoteManagerEditOrAdd(context.globalState.get<RemoteInfo>(RECENT_CONN_KEY));
	}));

	context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.edit', (arg) => {
		remoteManagerEditOrAdd(arg.remoteInfo, arg.entryIndex);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.remove', (arg) => {
		let savedRemotes = context.globalState.get<RemoteInfo[]>(CONNMGR_DATA_KEY);
		if (!savedRemotes)
			return;

		const remoteInfo = savedRemotes[arg.entryIndex];
		const quickPick = vscode.window.createQuickPick();
		const cancelLabel = 'Cancel';
		const labels = [
			`Confirm delete ${remoteInfo.displayLabel}`,
			cancelLabel
		];
		quickPick.items = labels.map(label => ({ label }));
		quickPick.onDidChangeSelection(selection => {
			try {
				if (!selection.length)
					return;
				if (selection[0].label === cancelLabel)
					return;

				// proceed with delete
				savedRemotes!.splice(arg.entryIndex, 1);
				context.globalState.update(CONNMGR_DATA_KEY, savedRemotes);
				remoteManagerDataProvider.refresh();
			} finally {
				quickPick.hide();
			}
		});
		quickPick.onDidHide(() => quickPick.dispose());
		quickPick.show();
	}));

	// command to connect to the remote when an item is selected from the remote manager view
	context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.itemSelect', (arg: string | number) => {
		let remoteInfo: RemoteInfo;
		if (arg === 'recent') {
			remoteInfo = context.globalState.get<RemoteInfo>(RECENT_CONN_KEY)!;
		} else {
			const savedRemotes = context.globalState.get<RemoteInfo[]>(CONNMGR_DATA_KEY);
			remoteInfo = savedRemotes![arg as number];
		}

		const quickPick = vscode.window.createQuickPick();

		// corresponds to the "reuseWindow" attribute
		const labels = [
			`Connect to ${remoteInfo.displayLabel} in New Window`,
			`Connect to ${remoteInfo.displayLabel} in Current Window`
		]
		quickPick.items = labels.map(label => ({ label }));
		quickPick.onDidChangeSelection(selection => {
			if (!selection.length)
				return;
			// actually do the stuffs
			const reuseWindow = Boolean(labels.indexOf(selection[0].label));
			return vscode.commands.executeCommand('vscode.newWindow',
				{ remoteAuthority: remoteInfo.fullAuthority, reuseWindow });
		});
		quickPick.onDidHide(() => quickPick.dispose());
		quickPick.show();
	}));
}

class RemoteTreeItem extends vscode.TreeItem {
	constructor(
		public readonly remoteInfo: RemoteInfo,
		public readonly entryIndex?: number
	) {
		super(remoteInfo.displayLabel, vscode.TreeItemCollapsibleState.None);

		this.tooltip = remoteInfo.displayLabel;
		this.description = remoteInfo.label ? [remoteInfo.host, remoteInfo.port].join(":") : "";

		if (remoteInfo.connectionToken) {
			this.iconPath = new vscode.ThemeIcon('lock');
		} else {
			this.iconPath = new vscode.ThemeIcon('unlock');
		}

		this.command = {
			title: "Connect to Remote",
			command: "remote-resolver.manager.itemSelect",
			arguments: [entryIndex]
		};
	}

	override contextValue = 'remoteItem';
}

class RecentRemoteTreeItem extends vscode.TreeItem {
	constructor(
		public readonly remoteInfo: RemoteInfo
	) {
		super("Last Connected", vscode.TreeItemCollapsibleState.None);

		this.tooltip = "Recently connected remote";
		this.description = remoteInfo.displayLabel;
	}

	override iconPath = new vscode.ThemeIcon('remote');
	override contextValue = 'remoteItemRecent';
	override command = {
		title: "Connect to Remote",
		command: "remote-resolver.manager.itemSelect",
		arguments: ["recent"]
	};
}

class RemoteManagerDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(
		private readonly extContext: vscode.ExtensionContext
	) { }

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem | undefined): vscode.TreeItem[] {
		if (element) {
			// we don't support folders/categories for now
			return [];
		}
		const ret: vscode.TreeItem[] = [];
		const recentRemoteInfo = this.extContext.globalState.get<RemoteInfo>(RECENT_CONN_KEY);
		if (recentRemoteInfo) {
			ret.push(new RecentRemoteTreeItem(recentRemoteInfo));
		}

		const savedRemotes = this.extContext.globalState.get<RemoteInfo[]>(CONNMGR_DATA_KEY);
		if (savedRemotes) {
			for (let i = 0; i < savedRemotes.length; ++i) {
				ret.push(new RemoteTreeItem(savedRemotes[i], i));
			}
		}

		return ret;
	}
}
