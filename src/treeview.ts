import * as vscode from 'vscode';
import * as common from './common';
import { context } from './extension';

export let remoteManagerDataProvider: RemoteManagerDataProvider;

class RemoteManagerDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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

class RemoteManagerDragProvider implements vscode.TreeDragAndDropController<RemoteTreeItem> {
	dropMimeTypes: readonly string[] = ['application/vnd.code.tree.tcprehmanager'];
	dragMimeTypes: readonly string[] = ['application/vnd.code.tree.tcprehmanager'];

	// @ts-ignore
	private itemIndexDrag: number | undefined = undefined;

	// @ts-ignore
	handleDrag?(source: readonly RemoteTreeItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
		const src = source[0];
		this.itemIndexDrag = src.entryIndex;
	}

	// @ts-ignore
	handleDrop?(target: RemoteTreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
		const targetIndex = target?.entryIndex;
		if (this.itemIndexDrag === undefined || targetIndex === undefined || targetIndex == this.itemIndexDrag) {
			return;
		}

		const savedRemotes = context.globalState.get<common.RemoteInfo[]>(common.CONNMGR_DATA_KEY)!;
		const srcItem = savedRemotes[this.itemIndexDrag];

		if (targetIndex > this.itemIndexDrag) {
			for (let i = this.itemIndexDrag; i < targetIndex; ++i) {
				savedRemotes[i] = savedRemotes[i + 1];
			}
		} else {
			for (let i = this.itemIndexDrag - 1; i >= targetIndex; --i) {
				savedRemotes[i + 1] = savedRemotes[i];
			}
		}
		savedRemotes[targetIndex] = srcItem;

		common.updateConnData(savedRemotes);
		remoteManagerDataProvider.refresh();
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
			this.iconPath = new vscode.ThemeIcon('vm-active');
		} else {
			this.iconPath = new vscode.ThemeIcon('vm');
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
	const remoteResolverManagerView = vscode.window.createTreeView('remoteResolverManagerView', {
		treeDataProvider: remoteManagerDataProvider,
		dragAndDropController: new RemoteManagerDragProvider()
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
