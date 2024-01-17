import * as vscode from 'vscode';
import * as common from './common';
import * as treeview from './treeview';
import { context } from './extension';

// commands to add/edit/remove items from remote manager
export async function remoteManagerEditOrAdd(prefill?: common.RemoteInfo, editIndex?: number) {
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

    let connInfo: common.RemoteInfo;
    try {
        connInfo = common.RemoteInfo.fromAddress(inputAddr, inputLabel);
    } catch (err) {
        vscode.window.showErrorMessage(err.message);
        return;
    }

    let savedRemotes = context.globalState.get<common.RemoteInfo[]>(common.CONNMGR_DATA_KEY);
    if (!savedRemotes)
        savedRemotes = [];

    if (editIndex !== undefined) {
        savedRemotes[editIndex] = connInfo;
    } else {
        savedRemotes.push(connInfo);
    }
    common.updateConnData(savedRemotes);

    treeview.remoteManagerDataProvider.refresh();
}

export function remoteManagerRemove(entryIndex: number) {
    let savedRemotes = context.globalState.get<common.RemoteInfo[]>(common.CONNMGR_DATA_KEY);
    if (!savedRemotes)
        return;

    const remoteInfo = savedRemotes[entryIndex];
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
            savedRemotes!.splice(entryIndex, 1);
            common.updateConnData(savedRemotes!);
            treeview.remoteManagerDataProvider.refresh();
        } finally {
            quickPick.hide();
        }
    });
    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
}

export function remoteManagerSelectItem(arg: string | number) {
    let remoteInfo: common.RemoteInfo;
    if (arg === 'recent') {
        remoteInfo = context.globalState.get<common.RemoteInfo>(common.RECENT_CONN_KEY)!;
    } else {
        const savedRemotes = context.globalState.get<common.RemoteInfo[]>(common.CONNMGR_DATA_KEY);
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
}
