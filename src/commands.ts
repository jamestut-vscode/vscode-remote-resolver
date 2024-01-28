import * as vscode from 'vscode';
import * as common from './common';
import { dataStor } from './extension';

// the command to manually connect to REH instance
export async function connectCommand(reuseWindow: boolean) {
    let recentConnInfo = common.RemoteInfo.fromJSON(dataStor.get(common.RECENT_CONN_KEY));
    const inputAddr = await vscode.window.showInputBox({
        title: "Enter remote target (only TCP is supported)",
        placeHolder: "hostname:port(:connectionToken)",
        value: recentConnInfo?.authority
    });
    if (!inputAddr)
        return;

    // check if supplied authority string is valid
    let currConnInfo = common.RemoteInfo.fromAddress(inputAddr);
    try {
        const remoteInfo = currConnInfo;
        dataStor.update(common.RECENT_CONN_KEY, remoteInfo);
    } catch (err) {
        vscode.window.showErrorMessage(err.message);
        return;
    }

    connectAuthority(currConnInfo, reuseWindow);
}

export function connectAuthority(remoteInfo: common.RemoteInfo, reuseWindow: boolean) {
    return vscode.commands.executeCommand('vscode.newWindow',
        { remoteAuthority: remoteInfo.fullAuthority, reuseWindow });
}
