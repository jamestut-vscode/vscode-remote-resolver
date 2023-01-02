/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {

	function doResolve(_authority: string): vscode.ResolvedAuthority {
		const connectionToken = undefined;
		return new vscode.ResolvedAuthority('192.168.67.10', 8000, connectionToken);
	}

	const authorityResolverDisposable = vscode.workspace.registerRemoteAuthorityResolver('test', {
		resolve(_authority: string): vscode.ResolvedAuthority {
			return doResolve(_authority);
		}
	});
	context.subscriptions.push(authorityResolverDisposable);

	context.subscriptions.push(vscode.commands.registerCommand('vscode-testresolver.newWindow', () => {
		return vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: 'test+test' });
	}));
	context.subscriptions.push(vscode.commands.registerCommand('vscode-testresolver.currentWindow', () => {
		return vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: 'test+test', reuseWindow: true });
	}));
	context.subscriptions.push(vscode.commands.registerCommand('vscode-testresolver.newWindowWithError', () => {
		return vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: 'test+error' });
	}));
	context.subscriptions.push(vscode.commands.registerCommand('vscode-testresolver.showLog', () => {
		if (outputChannel) {
			outputChannel.show();
		}
	}));
}
