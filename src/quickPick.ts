import * as vscode from 'vscode';
import * as common from './common';
import * as remoteParse from './remoteParse';
import * as commands from './commands';
import * as treeview from './treeview';
import * as uihelper from './uihelper';
import { dataStor } from './extension';

interface ExtendedQuickPickItem extends vscode.QuickPickItem {
    remoteId: string;
}

// if genId did not change, don't generate quickPickItems
let genId: number | undefined;
let quickPickItems: ExtendedQuickPickItem[] | undefined;
let connData: common.ContainerInfo | undefined;

function generateFlatRemotes(nfo: common.ContainerInfo): ExtendedQuickPickItem[] {
    interface DirInfo {
        displayName: string;
        dirId: string;
    }

    const ret: ExtendedQuickPickItem[] = [];
    // perform breadth first search
    // curDir[parent, display path name, dirId]
    let queuedDirs: DirInfo[] = [
        { displayName: "", dirId: "root" }
    ];
    while (queuedDirs.length) {
        const curDir = queuedDirs.shift()!;
        const dirInfo = nfo.directories.get(curDir.dirId);
        if (dirInfo === undefined) {
            console.error(`Directory entry of '${curDir.dirId}' does not exist.`);
            continue;
        }
        ret.push(...dirInfo.remoteIds.map(
            (remoteId): ExtendedQuickPickItem => {
                const remoteInfo = nfo.remotes.get(remoteId);
                return {
                    label: `${curDir.displayName}${remoteInfo?.displayLabel || "(error)"}`,
                    detail: remoteInfo?.description || "(broken directory entry)",
                    remoteId: remoteId
                };
            }
        ));
        queuedDirs.push(...dirInfo.dirIds.map(
            (nextDirId): DirInfo => {
                const nextDirLabel = nfo.directories.get(nextDirId)?.label || "(dir error)";
                return {
                    displayName: `${curDir.displayName}${nextDirLabel}/`,
                    dirId: nextDirId
                };
            }
        ));
    }

    return ret;
}

export async function quickPickCommand() {
    const newGenId = dataStor.get<number>(common.CONNMGR_DATA_GENID_KEY, 0);
    if (genId != newGenId || quickPickItems === undefined) {
        // refresh is needed: regenerate the QP items
        genId = newGenId;
        connData = await common.getConnData();
        quickPickItems = generateFlatRemotes(connData);
    }
    const qp = vscode.window.createQuickPick<ExtendedQuickPickItem>();
    qp.items = quickPickItems;
    qp.onDidAccept(() => {
        if (qp.selectedItems.length === 1) {
            qp.hide();
            quickPicked(qp.selectedItems[0]);
        }
    });
    qp.title = "Open saved remote";
    qp.placeholder = "Search for saved remote";
    qp.matchOnDetail = true;
    qp.show();
}

async function askUpdate() {
    await common.updateConnData();
    treeview.remoteManagerDataProvider.refresh();
}

async function quickPicked(picked: ExtendedQuickPickItem) {
    const remoteId = picked.remoteId;
    const remoteInfo = connData?.remotes.get(picked.remoteId);

    if (remoteInfo === undefined) {
        vscode.window.showErrorMessage("Remote data not found. Database might be corrupted.");
        return;
    }

    interface CmdQuickPickItem extends vscode.QuickPickItem {
        command?: () => void | Promise<void>;
    }

    const quickPickCommands = [
        {
            label: "Connect",
            kind: vscode.QuickPickItemKind.Separator
        },
        {
            label: "Connect in Current Window",
            command: () => { commands.connectAuthority(remoteInfo, true) }
        },
        {
            label: "Connect in New Window",
            command: () => { commands.connectAuthority(remoteInfo, false) }
        },
        {
            label: "Manage",
            kind: vscode.QuickPickItemKind.Separator
        },
        {
            label: "Modify Remote",
            command: async () => {
                const newAddr = await uihelper.promptRemoteInput(remoteInfo);
                if (newAddr === undefined) return;
                let newLabel = await uihelper.promptLabelInput(remoteInfo);
                if (newLabel === undefined) return;
                if (!newLabel) newLabel = undefined;

                connData!.remotes.set(
                    remoteId,
                    remoteParse.remoteFromAddress(newAddr, newLabel)
                );
                askUpdate();
            }
        },
        {
            label: "Delete Remote",
            command: () => {
                uihelper.remoteDeleteConfirmDialog(remoteInfo, () => {
                    connData!.remotes.delete(remoteId);
                    askUpdate();
                });
            }
        }
    ];

    const cmd = await vscode.window.showQuickPick<CmdQuickPickItem>(
        quickPickCommands,
        {
            title: remoteInfo.displayLabel,
            canPickMany: false
        }
    );
    if (cmd && cmd.command) {
        cmd.command();
    }
}
