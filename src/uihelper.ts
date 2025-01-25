import * as vscode from 'vscode';
import * as common from './common';

export function validateRemoteInput(value: string): string | undefined {
    if (!value) {
        return "Empty remote";
    }
    try {
        common.RemoteInfo.fromAddress(value);
        return;
    } catch (err) {
        return err.message;
    }
}

export async function promptRemoteInput(
    remoteToEdit: common.RemoteInfo | undefined,
    title: string | undefined = undefined
) {
    return await vscode.window.showInputBox({
        title: title || "Enter Remote Target (TCP)",
        placeHolder: "hostname:port(:connectionToken)",
        value: remoteToEdit?.authority,
        validateInput: validateRemoteInput,
        ignoreFocusOut: true
    });
}

export function validateLabel(label: string): string | undefined {
    try {
        common.RemoteInfo.checkLabelValid(label);
        return;
    } catch (err) {
        return err.message;
    }
}

export async function promptLabelInput(
    remoteToEdit: common.RemoteInfo | undefined,
    title: string | undefined = undefined
) {
    return await vscode.window.showInputBox({
        title: title || "Nickname",
        placeHolder: "optional nickname",
        value: remoteToEdit?.label,
        validateInput: validateLabel,
        ignoreFocusOut: true
    });
}

export function commonDeleteConfirmDialog(msg: string, confirmCallback: () => void) {
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

export function remoteDeleteConfirmDialog(ri: common.RemoteInfo, confirmCallback: () => void) {
    commonDeleteConfirmDialog(`Confirm delete '${ri.displayLabel}'`, confirmCallback);
}
