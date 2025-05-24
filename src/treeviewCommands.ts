import * as vscode from 'vscode';
import * as common from './common';
import * as remoteParse from './remoteParse';
import * as treeview from './treeview';
import * as uihelper from './uihelper';
import * as commands from './commands';

export async function remoteManagerEditOrAddCommand(
    remoteItem: treeview.DirectoryTreeItem | treeview.RemoteTreeItem | treeview.RecentRemoteTreeItem | undefined
) {
    const connData = await common.getConnData();
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

    const inputAddr = await uihelper.promptRemoteInput(
        remoteToEdit,
        `${remoteToEdit ? "Edit" : "Add"} Remote Address`
    );
    if (inputAddr === undefined) return;

    let inputLabel = await uihelper.promptLabelInput(
        remoteToEdit,
        !remoteToEdit ? "Edit Nickname" : undefined
    );
    // user changed their mind while entering the nickname
    if (inputLabel === undefined) return;

    // use default value if label is falsy but not undefined (e.g. empty string)
    if (!inputLabel)
        inputLabel = undefined;

    let newRemoteInfo: common.RemoteInfo;
    try {
        newRemoteInfo = remoteParse.remoteFromAddress(inputAddr, inputLabel);
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

export async function remoteManagerRemoveRemoteCommand(remoteItem: treeview.RemoteTreeItem) {
    const connData = await common.getConnData();
    const parentDirId = treeview.getDirId(remoteItem.parentDir);
    const parentDirInfo = connData.directories.get(parentDirId)!;
    const remoteInfo = connData.remotes.get(remoteItem.entryId)!;

    uihelper.remoteDeleteConfirmDialog(remoteInfo, () => {
        parentDirInfo.remoteIds.splice(remoteItem.entryIndex, 1);
        connData.remotes.delete(remoteItem.entryId);
        commonTreeviewUpdate(remoteItem.parentDir);
    });
}

export async function remoteManagerRemoveDirCommand(dirItem: treeview.DirectoryTreeItem) {
    const connData = await common.getConnData();
    const parentDirInfo = connData.directories.get(treeview.getDirId(dirItem.parentDir))!;

    uihelper.commonDeleteConfirmDialog(
        `Confirm delete '${dirItem.label}' and all of its entries`,
        () => {
            parentDirInfo.dirIds.splice(dirItem.entryIndex, 1);
            removeDirRecursive(dirItem.entryId);
            commonTreeviewUpdate(dirItem.parentDir);
        }
    );
}

async function removeDirRecursive(dirId: string) {
    const connData = await common.getConnData();
    const rmDirInfo = connData.directories.get(dirId)!;

    for (const chldRemoteId of rmDirInfo.remoteIds) {
        connData.remotes.delete(chldRemoteId);
    }
    for (const chldDirId of rmDirInfo.dirIds) {
        await removeDirRecursive(chldDirId);
    }
    connData.directories.delete(dirId);
}

export function remoteManagerRenameDirCommand(dirItem: treeview.DirectoryTreeItem) {
    const currName = dirItem.label?.toString();
    commonFolderNameInputDialog(currName, async (newName) => {
        if (newName === currName) {
            return;
        }
        const connData = await common.getConnData();
        connData.directories.get(dirItem.entryId)!.label = newName;
        commonTreeviewUpdate(dirItem.parentDir);
    })
}

export function remoteManagerAddDirCommand(parentDir: treeview.DirectoryTreeItem | undefined) {
    commonFolderNameInputDialog(undefined, async (newName) => {
        const parentDirId = treeview.getDirId(parentDir);
        const connData = await common.getConnData();
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
