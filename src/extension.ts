/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {

	function doResolve(_authority: string, progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<vscode.ResolvedAuthority> {
		const connectionToken = undefined;

		// eslint-disable-next-line no-async-promise-executor
		const serverPromise = new Promise<vscode.ResolvedAuthority>(async (res, _rej) => {
			progress.report({ message: 'Starting Test Resolver' });
			outputChannel = vscode.window.createOutputChannel('TestResolver');

			console.log("Server promise without proxy!");
			res(new vscode.ResolvedAuthority('192.168.67.10', 8000, connectionToken));
		});
		return serverPromise;
	}

	const authorityResolverDisposable = vscode.workspace.registerRemoteAuthorityResolver('test', {
		async getCanonicalURI(uri: vscode.Uri): Promise<vscode.Uri> {
			return vscode.Uri.file(uri.path);
		},
		resolve(_authority: string): Thenable<vscode.ResolvedAuthority> {
			return vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Open TestResolver Remote ([details](command:vscode-testresolver.showLog))',
				cancellable: false
			}, (progress) => doResolve(_authority, progress));
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
