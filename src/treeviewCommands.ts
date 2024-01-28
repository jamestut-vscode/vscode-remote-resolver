import * as vscode from 'vscode';
import * as common from './common';
import * as treeview from './treeview';
import * as commands from './commands';

export async function remoteManagerEditOrAdd(
    remoteItem: treeview.DirectoryTreeItem | treeview.RemoteTreeItem | treeview.RecentRemoteTreeItem | undefined
) {
    const connData = common.getConnData();
    let remoteToEdit: common.RemoteInfo | undefined = undefined;
    let parentDirId: string;
    if (remoteItem instanceof treeview.DirectoryTreeItem) {
        // we're adding a new remote from a folder
        parentDirId = remoteItem.entryId;
    } else {
        remoteToEdit = remoteItem?.remoteInfo;
        parentDirId = treeview.getDirId(remoteItem?.parentDir);
    }
    const parentDirInfo = connData.directories.get(parentDirId);
    if (!parentDirInfo) {
        throw new Error(`Error retreiving directory info for '${parentDirId}'`);
    }

    const inputAddr = await vscode.window.showInputBox({
        title: "Add remote address",
        placeHolder: "hostname:port(:connectionToken)",
        value: remoteToEdit?.authority
    });
    if (!inputAddr)
        return;

    let inputLabel = await vscode.window.showInputBox({
        title: "Enter nickname (optional)",
        placeHolder: "nickname",
        value: remoteToEdit?.label
    });
    if (inputLabel === undefined) {
        // user changed their mind while entering the nickname
        return;
    }
    if (!inputLabel)
        inputLabel = undefined;

    let newRemoteInfo: common.RemoteInfo;
    try {
        newRemoteInfo = common.RemoteInfo.fromAddress(inputAddr, inputLabel);
    } catch (err) {
        vscode.window.showErrorMessage(err.message);
        return;
    }

    let remoteId;
    if (remoteItem instanceof treeview.RemoteTreeItem) {
        remoteId = remoteItem.entryId;
    } else {
        // we're creating new remote instead of editing: update the dir info of the parent
        remoteId = common.genId("remote");
        parentDirInfo.remoteIds.push(remoteId);
    }
    connData.remotes.set(remoteId, newRemoteInfo);

    commonTreeviewUpdate(remoteItem?.parentDir);
}

export function remoteManagerRemoveRemote(remoteItem: treeview.RemoteTreeItem) {
    const connData = common.getConnData();
    const parentDirId = treeview.getDirId(remoteItem.parentDir);
    const parentDirInfo = connData.directories.get(parentDirId)!;
    const remoteInfo = connData.remotes.get(remoteItem.entryId)!;

    commonDeleteConfirmDialog(`Confirm delete '${remoteInfo.displayLabel}'`, () => {
        parentDirInfo.remoteIds.splice(remoteItem.entryIndex, 1);
        connData.remotes.delete(remoteItem.entryId);
        commonTreeviewUpdate(remoteItem.parentDir);
    });
}

export function remoteManagerRemoveDir(dirItem: treeview.DirectoryTreeItem) {
    const connData = common.getConnData();
    const parentDirInfo = connData.directories.get(treeview.getDirId(dirItem.parentDir))!;

    commonDeleteConfirmDialog(`Confirm delete '${dirItem.label}' and all of its entries`, () => {
        parentDirInfo.dirIds.splice(dirItem.entryIndex, 1);
        removeDirRecursive(dirItem.entryId);
        commonTreeviewUpdate(dirItem.parentDir);
    });
}

function removeDirRecursive(dirId: string) {
    const connData = common.getConnData();
    const rmDirInfo = connData.directories.get(dirId)!;

    for (const chldRemoteId of rmDirInfo.remoteIds) {
        connData.remotes.delete(chldRemoteId);
    }
    for (const chldDirId of rmDirInfo.dirIds) {
        removeDirRecursive(chldDirId);
    }
    connData.directories.delete(dirId);
}

function commonDeleteConfirmDialog(msg: string, confirmCallback: () => void) {
    const cancelLabel = 'Cancel';
    if (msg === cancelLabel) {
        throw Error("Invalid label");
    }
    const labels = [msg, cancelLabel];
    const quickPick = vscode.window.createQuickPick();
    quickPick.items = labels.map(label => ({ label }));
    quickPick.onDidChangeSelection(selection => {
        try {
            if (!selection.length)
                return;
            if (selection[0].label === cancelLabel)
                return;
            confirmCallback();
        } finally {
            quickPick.hide();
        }
    });
    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
}

export function remoteManagerRenameDir(dirItem: treeview.DirectoryTreeItem) {
    const currName = dirItem.label?.toString();
    commonFolderNameInputDialog(currName, (newName) => {
        if (newName === currName) {
            return;
        }
        const connData = common.getConnData();
        connData.directories.get(dirItem.entryId)!.label = newName;
        commonTreeviewUpdate(dirItem.parentDir);
    })
}

export function remoteManagerAddDir(parentDir: treeview.DirectoryTreeItem | undefined) {
    commonFolderNameInputDialog(undefined, (newName) => {
        const parentDirId = treeview.getDirId(parentDir);
        const connData = common.getConnData();
        const newDirId = common.genId("dir");
        connData.directories.set(newDirId, new common.DirectoryInfo(newName));
        connData.directories.get(parentDirId)!.dirIds.push(newDirId);
        commonTreeviewUpdate(parentDir);
    });
}

async function commonFolderNameInputDialog(prefill: string | undefined, confirmCallback: (arg: string) => void) {
    const inputLabel = await vscode.window.showInputBox({
        title: "Folder name",
        value: prefill
    });

    // all folders must have name
    if (!inputLabel)
        return;

    confirmCallback(inputLabel);
}

export function moveUp(item: treeview.DirectoryTreeItem) {
    moveUpDown(item, "up");
}

export function moveDown(item: treeview.DirectoryTreeItem) {
    moveUpDown(item, "down");
}

function moveUpDown(item: treeview.DirectoryTreeItem, direction: "up" | "down") {
    const connData = common.getConnData();
    const parentDirData = connData.directories.get(treeview.getDirId(item.parentDir))!.dirIds;
    const newIndex = item.entryIndex + (direction === "up" ? -1 : 1);
    // basic bound check
    if (newIndex < 0 || newIndex >= parentDirData.length) {
        return;
    }
    // swap!
    const swp = parentDirData[item.entryIndex];
    parentDirData[item.entryIndex] = parentDirData[newIndex];
    parentDirData[newIndex] = swp;
    commonTreeviewUpdate(item.parentDir);
}

export function connect(
    item: treeview.RemoteTreeItem | treeview.RecentRemoteTreeItem,
    reuseWindow: boolean
) {
    return commands.connectAuthority(item.remoteInfo, reuseWindow);
}

/**
 * Convenience hunction to trigger Memento update + update the treeview.
 * @param parentDir If specified, only the items in this argument will be updated instead of the whole treeview.
 */
async function commonTreeviewUpdate(parentDir: treeview.DirectoryTreeItem | undefined) {
    await common.updateConnData();
    treeview.remoteManagerDataProvider.refresh(parentDir);
}
