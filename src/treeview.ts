import * as vscode from 'vscode';
import * as common from './common';
import { context } from './extension';

export let remoteManagerDataProvider: RemoteManagerDataProvider;
export let remoteResolverManagerView: vscode.TreeView<vscode.TreeItem>;

export class RemoteManagerDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _generationId: number;
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(
		private readonly extContext: vscode.ExtensionContext
	) {
		this._generationId = 0;
	}

	refresh() {
		const newGenId = this.extContext.globalState.get<number>(common.CONNMGR_DATA_GENID_KEY, 0);
		if (newGenId == this._generationId) {
			// nothing changed
			return;
		}
		this._generationId = newGenId;
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
		const recentRemoteInfo = this.extContext.globalState.get<common.RemoteInfo>(common.RECENT_CONN_KEY);
		if (recentRemoteInfo) {
			ret.push(new RecentRemoteTreeItem(recentRemoteInfo));
		}

		const savedRemotes = this.extContext.globalState.get<common.RemoteInfo[]>(common.CONNMGR_DATA_KEY);
		if (savedRemotes) {
			for (let i = 0; i < savedRemotes.length; ++i) {
				ret.push(new RemoteTreeItem(savedRemotes[i], i));
			}
		}

		return ret;
	}
}

class RemoteTreeItem extends vscode.TreeItem {
	constructor(
		public readonly remoteInfo: common.RemoteInfo,
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
		public readonly remoteInfo: common.RemoteInfo
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

export function initializeTreeView() {
    remoteManagerDataProvider = new RemoteManagerDataProvider(context);
	remoteResolverManagerView = vscode.window.createTreeView('remoteResolverManagerView', {
		treeDataProvider: remoteManagerDataProvider
	});

    // data might be modified from other window/view: refresh when view is focused
	remoteResolverManagerView.onDidChangeVisibility((e) => {
		if (e.visible) {
			remoteManagerDataProvider.refresh();
		}
	});
	vscode.window.onDidChangeWindowState((e) => {
		if (e.focused) {
			remoteManagerDataProvider.refresh();
		}
	});
}
