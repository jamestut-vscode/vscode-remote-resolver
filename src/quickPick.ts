import * as vscode from 'vscode';
import * as common from './common';
import * as commands from './commands';
import { dataStor } from './extension';

interface ExtendedQuickPickItem extends vscode.QuickPickItem {
    remoteInfo: common.RemoteInfo | undefined;
}

// if genId did not change, don't generate quickPickItems
let genId: number | undefined;
let quickPickItems: ExtendedQuickPickItem[] | undefined;

function generateFlatRemotes(nfo: common.ContainerInfo): ExtendedQuickPickItem[] {
    interface DirInfo {
        displayName: string;
        dirId: string;
    }

    const ret: ExtendedQuickPickItem[] = [];
    // perform breadth first search
    // curDir[parent, display path name, dirId]
    let queuedDirs: DirInfo[] = [
        {displayName: "", dirId: "root"}
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
                    remoteInfo: remoteInfo
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
        quickPickItems = generateFlatRemotes(await common.getConnData());
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

async function quickPicked(picked: ExtendedQuickPickItem) {
    const remoteInfo = picked.remoteInfo;
    interface CmdQuickPickItem extends vscode.QuickPickItem {
        command?: (r: common.RemoteInfo) => void;
    }
    const cmd = await vscode.window.showQuickPick<CmdQuickPickItem>([
        {
            label: "Connect",
            kind: vscode.QuickPickItemKind.Separator
        },
        {
            label: "Connect in Current Window",
            command: (x: common.RemoteInfo) => {commands.connectAuthority(x, true)}
        },
        {
            label: "Connect in New Window",
            command: (x: common.RemoteInfo) => {commands.connectAuthority(x, false)}
        }
        // {
        //     label: "Manage",
        //     kind: vscode.QuickPickItemKind.Separator
        // },
        // {
        //     label: "Modify Remote",
        //     command: // TODO
        // },
        // {
        //     label: "Delete Remote",
        //     command: // TODO
        // }
    ],
    {
        title: remoteInfo?.displayLabel,
        canPickMany: false
    });
    if (cmd && cmd.command && remoteInfo) {
        cmd.command(remoteInfo);
    }
}
