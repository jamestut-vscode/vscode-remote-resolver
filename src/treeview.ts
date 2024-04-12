import * as vscode from 'vscode';
import * as common from './common';
import { dataStor } from './extension';

export let remoteManagerDataProvider: RemoteManagerDataProvider;

type RefreshReqType = Set<DirectoryTreeItem|undefined>;

class RemoteManagerDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _generationId: number;
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor() {
		this._generationId = 0;
	}

	refresh(dirToRefresh: DirectoryTreeItem | undefined = undefined) {
		const newGenId = dataStor.get<number>(common.CONNMGR_DATA_GENID_KEY, 0);
		if (newGenId == this._generationId) {
			// nothing changed
			return;
		}
		this._generationId = newGenId;
		this._onDidChangeTreeData.fire(dirToRefresh);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(parentElement?: vscode.TreeItem | undefined): vscode.TreeItem[] {
		let dirId = "root";
		const ret: vscode.TreeItem[] = [];
		if (parentElement) {
			if (parentElement instanceof DirectoryTreeItem) {
				dirId = parentElement.entryId;
			} else {
				return ret;
			}
		} else {
			// This is root element.
			// we have a special item here: recent connection
			const recentRemoteInfoData = dataStor.get(common.RECENT_CONN_KEY);
			if (recentRemoteInfoData) {
				const recentRemoteInfo = common.RemoteInfo.fromJSON(recentRemoteInfoData);
				ret.push(new RecentRemoteTreeItem(recentRemoteInfo));
			}
		}

		const connData = common.getConnData();
		const dirInfo = connData.directories.get(dirId);
		if (dirInfo) {
			// directories always come on top before the remotes
			for (let i = 0; i < dirInfo.dirIds.length; ++i) {
				const chldDirId = dirInfo.dirIds[i];
				const chldDir = connData.directories.get(chldDirId);
				if (chldDir) {
					const canMoveUp = i > 0;
					const canMoveDown = i < (dirInfo.dirIds.length - 1);
					ret.push(new DirectoryTreeItem(chldDir.label, i, chldDirId, parentElement,
						canMoveUp, canMoveDown));
				}
			}

			for (let i = 0; i < dirInfo.remoteIds.length; ++i) {
				const chldRemoteId = dirInfo.remoteIds[i];
				const remoteInfo = connData.remotes.get(chldRemoteId);
				if (remoteInfo) {
					ret.push(new RemoteTreeItem(remoteInfo, i, chldRemoteId, parentElement));
				}
			}
		}

		return ret;
	}
}

class RemoteManagerDragProvider implements vscode.TreeDragAndDropController<vscode.TreeItem> {
	dropMimeTypes: readonly string[] = ['application/vnd.code.tree.tcprehmanager'];
	dragMimeTypes: readonly string[] = ['application/vnd.code.tree.tcprehmanager'];

	private itemToMove: RemoteTreeItem | DirectoryTreeItem | undefined = undefined;

	handleDrag?(source: readonly vscode.TreeItem[], _dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): void | Thenable<void> {
		const itemToMove = source[0];
		if (itemToMove instanceof RemoteTreeItem || itemToMove instanceof DirectoryTreeItem) {
			this.itemToMove = itemToMove;
		} else {
			this.itemToMove = undefined;
		}
	}

	handleDrop?(target: vscode.TreeItem | undefined, _dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): void | Thenable<void> {
		if (this.itemToMove === undefined) {
			return;
		}
		if (target === this.itemToMove) {
			// make sure we're not moving things to itself
			return;
		}
		if (!(target instanceof RemoteTreeItem || target instanceof DirectoryTreeItem || target === undefined)) {
			// only these 2 items can be rearranged around
			return;
		}

		const dirTreeToRefresh: RefreshReqType = new Set<DirectoryTreeItem|undefined>();
		this.#handleDrop(this.itemToMove, target, dirTreeToRefresh);
		this.itemToMove = undefined;

		if (dirTreeToRefresh.size) {
			common.updateConnData();
			// micro-optimisation is the root of all evil
			if (dirTreeToRefresh.size === 1) {
				for (const d of dirTreeToRefresh) {
					remoteManagerDataProvider.refresh(d);
				}
			} else {
				remoteManagerDataProvider.refresh();
			}
		}
	}

	#handleDrop(
		source: DirectoryTreeItem | RemoteTreeItem,
		target: DirectoryTreeItem | RemoteTreeItem | undefined,
		refreshReq: RefreshReqType
	): void {
		if (target === undefined || target instanceof DirectoryTreeItem) {
			this.#maybeReparent(source, target, refreshReq);
		} else if (source instanceof RemoteTreeItem && target instanceof RemoteTreeItem) {
			// same item type == reparent (if needed) + rearrange
			this.#rearrangeItem(source, target, refreshReq);
		}
	}

	#maybeReparent(
		item: DirectoryTreeItem | RemoteTreeItem,
		newParent: DirectoryTreeItem | undefined,
		refreshReq: RefreshReqType
	): boolean {
		if (item.parentDir === newParent) {
			// no need to reparent
			return false;
		}

		if (item instanceof DirectoryTreeItem) {
			// special treatment for directories
			// check if my new parent would have my oldself as the ancestor
			if (newParent) {
				for (let p: DirectoryTreeItem | undefined = newParent; p; p = p?.parentDir) {
					if (p == item) {
						return false;
					}
				}
			}
		}

		// let's do the reparenting
		refreshReq.add(item.parentDir);
		refreshReq.add(newParent);

		// move the entry in the data
		// BEWARE: the TreeItem is not modified
		const connData = common.getConnData();
		const srcDir = connData.directories.get(getDirId(item.parentDir))!;
		const tgtDir = connData.directories.get(getDirId(newParent))!;
		const srcList = getAppropriateList(item, srcDir);
		const tgtList = getAppropriateList(item, tgtDir);
		tgtList.push(srcList[item.entryIndex]);
		srcList.splice(item.entryIndex, 1);

		return true;
	}

	#rearrangeItem(
		source: RemoteTreeItem,
		target: RemoteTreeItem,
		refreshReq: RefreshReqType
	): void {
		const connData = common.getConnData();
		let srcIndex: number;
		const dstIndex = target.entryIndex;

		const parentDirInfo = connData.directories.get(getDirId(target.parentDir))!;
		const targetList = getAppropriateList(target, parentDirInfo);

		if (this.#maybeReparent(source, target.parentDir, refreshReq)) {
			// maybeReparent doesn't update the source's index if reparenting happened,
			// thus we need to infer it by our own
			srcIndex = targetList.length - 1;
		} else {
			srcIndex = source.entryIndex;
		}

		if (srcIndex === dstIndex) {
			return;
		}

		// both source and target should have the same parent at this point
		refreshReq.add(target.parentDir);

		const srcItem = targetList[srcIndex];

		if (dstIndex > srcIndex) {
			for (let i = srcIndex; i < dstIndex; ++i) {
				targetList[i] = targetList[i + 1];
			}
		} else {
			for (let i = srcIndex - 1; i >= dstIndex; --i) {
				targetList[i + 1] = targetList[i];
			}
		}
		targetList[dstIndex] = srcItem;
	}
}

export class RemoteTreeItem extends vscode.TreeItem {
	constructor(
		public readonly remoteInfo: common.RemoteInfo,
		public readonly entryIndex: number,
		public readonly entryId: string,
		public readonly parentDir: DirectoryTreeItem | undefined
	) {
		super(remoteInfo.displayLabel, vscode.TreeItemCollapsibleState.None);

		this.tooltip = remoteInfo.displayLabel;
		this.description = remoteInfo.label ? [remoteInfo.host, remoteInfo.port].join(":") : "";

		if (remoteInfo.connectionToken) {
			this.iconPath = new vscode.ThemeIcon('vm-active');
		} else {
			this.iconPath = new vscode.ThemeIcon('vm');
		}
	}

	override contextValue = 'remoteItem';
}

export class RecentRemoteTreeItem extends vscode.TreeItem {
	// for interface consistency with RemoteTreeItem
	public readonly parentDir: DirectoryTreeItem | undefined = undefined;

	constructor(
		public readonly remoteInfo: common.RemoteInfo
	) {
		super("Last Connected", vscode.TreeItemCollapsibleState.None);

		this.tooltip = "Recently connected remote";
		this.description = remoteInfo.displayLabel;
	}

	override iconPath = new vscode.ThemeIcon('remote');
	override contextValue = 'remoteItemRecent';
}

export class DirectoryTreeItem extends vscode.TreeItem {
	override iconPath = new vscode.ThemeIcon('folder');

	constructor(
		label: string,
		public readonly entryIndex: number,
		public readonly entryId: string,
		public readonly parentDir: DirectoryTreeItem | undefined,
		public readonly canMoveUp: boolean,
		public readonly canMoveDown: boolean
	) {
		super(label, vscode.TreeItemCollapsibleState.Collapsed);

		const contextVal = ['remoteItemDir'];
		if (canMoveUp)
			contextVal.push('up');
		if (canMoveDown)
			contextVal.push('down');
		this.contextValue = contextVal.join('_');
	}
}

export function getDirId(item: DirectoryTreeItem | undefined) {
	return item?.entryId || "root";
}

/**
 * @returns dirInfo.dirIds if item is a DirectoryTreeItem, or dirInfo.remoteIds if item is a RemoteTreeItem
 */
function getAppropriateList(item: DirectoryTreeItem | RemoteTreeItem, dirInfo: common.DirectoryInfo): string[] {
	if (item instanceof DirectoryTreeItem) {
		return dirInfo.dirIds;
	} else if (item instanceof RemoteTreeItem) {
		return dirInfo.remoteIds;
	} else {
		throw new Error("Invalid value type");
	}
}

export function initializeTreeView() {
    remoteManagerDataProvider = new RemoteManagerDataProvider();
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
