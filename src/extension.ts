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

export let context: vscode.ExtensionContext;

export function activate(extContext: vscode.ExtensionContext) {
    context = extContext;

    treeview.initializeTreeView();

    context.subscriptions.push(vscode.workspace.registerRemoteAuthorityResolver('tcpreh', 
        new authority.AuthorityResolver()));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.newWindow', async () => {
        return await commands.connectCommand(false);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.currentWindow', async () => {
        return await commands.connectCommand(true);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.add', () => {
        treeviewCommands.remoteManagerEditOrAdd();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.addRecent', () => {
        treeviewCommands.remoteManagerEditOrAdd(context.globalState.get<common.RemoteInfo>(common.RECENT_CONN_KEY));
    }));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.edit', (arg) => {
        treeviewCommands.remoteManagerEditOrAdd(arg.remoteInfo, arg.entryIndex);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.remove', (arg) => {
        treeviewCommands.remoteManagerRemove(arg.entryIndex)
    }));

    // command to connect to the remote when an item is selected from the remote manager view
    context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.manager.itemSelect', 
        treeviewCommands.remoteManagerSelectItem));
}
