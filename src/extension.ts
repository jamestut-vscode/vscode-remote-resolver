/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as common from './common';
import * as authority from './authority';
import * as commands from './commands';
import * as treeview from './treeview';
import * as treeviewCommands from './treeviewCommands';
import * as quickPick from './quickPick';

export let dataStor: vscode.Memento;
export let extContext: vscode.ExtensionContext;

export async function activate(context: vscode.ExtensionContext) {
    extContext = context;
    dataStor = context.globalState;

    vscode.commands.executeCommand('setContext', 'forwardedPortsViewEnabled', true);

    await common.maybeUpgradeConnData();

    // preload data so that common.currConnData is never undefined
    await common.getConnData();

    treeview.initializeTreeView();

    context.subscriptions.push(vscode.workspace.registerRemoteAuthorityResolver('jra',
        new authority.AuthorityResolver()));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.newWindow', async () => {
        return await commands.connectCommand(false);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.currentWindow', async () => {
        return await commands.connectCommand(true);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.quickPickRemote', async () => {
        return await quickPick.quickPickCommand();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.connectNewWindow', async (arg) => {
        return await treeviewCommands.connect(arg, false);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.connectCurrentWindow', async (arg) => {
        return await treeviewCommands.connect(arg, true);
    }));

    for (const cmdId of ['remote-resolver.manager.add', 'remote-resolver.manager.addRecent', 'remote-resolver.manager.edit']) {
        context.subscriptions.push(vscode.commands.registerCommand(cmdId,
            treeviewCommands.remoteManagerEditOrAddCommand));
    }

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.remove',
        treeviewCommands.remoteManagerRemoveRemoteCommand));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.addFolder',
        treeviewCommands.remoteManagerAddDirCommand));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.renameFolder',
        treeviewCommands.remoteManagerRenameDirCommand));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.removeFolder',
        treeviewCommands.remoteManagerRemoveDirCommand));
}

export function getContext(): vscode.ExtensionContext {
    return extContext;
}
