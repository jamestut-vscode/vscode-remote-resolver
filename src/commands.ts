import * as vscode from 'vscode';
import * as common from './common';
import { context } from './extension';

// the command to manually connect to REH instance
export async function connectCommand(reuseWindow: boolean) {
    let recentConnInfo = context.globalState.get<common.RemoteInfo>(common.RECENT_CONN_KEY);
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
        context.globalState.update(common.RECENT_CONN_KEY, remoteInfo);
    } catch (err) {
        vscode.window.showErrorMessage(err.message);
        return;
    }

    return vscode.commands.executeCommand('vscode.newWindow',
        { remoteAuthority: `tcpreh+${currConnInfo.authority}`, reuseWindow });
}
