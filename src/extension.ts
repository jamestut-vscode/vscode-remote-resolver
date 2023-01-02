/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('Resolver Extension');
	outputChannel.appendLine("Resolver extension is activating ...");

	function doResolve(authority: string): vscode.ResolvedAuthority {
		let [host, port] = authority.split("+", 2)[1].split(":", 2);
		if (!port) {
			throw new Error("Port number is undefined");
		}
		const connectionToken = undefined;
		return new vscode.ResolvedAuthority(host, parseInt(port), connectionToken);
	}

	const authorityResolverDisposable = vscode.workspace.registerRemoteAuthorityResolver('test', {
		resolve(_authority: string): vscode.ResolvedAuthority {
			return doResolve(_authority);
		}
	});
	context.subscriptions.push(authorityResolverDisposable);

	async function connectCommand(reuseWindow: boolean) {
		const keyName = "lastEnteredHost";
		let currValue: string | undefined = context.globalState.get<string>(keyName);
		currValue = await vscode.window.showInputBox({
			title: "Enter remote target (only TCP is supported)",
			placeHolder: "hostname:port",
			value: currValue
		});
		if (!currValue)
			return;
		context.globalState.update(keyName, currValue);
		return vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: `test+${currValue}`, reuseWindow });
	}

	context.subscriptions.push(vscode.commands.registerCommand('vscode-testresolver.newWindow', async () => {
		return await connectCommand(false);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('vscode-testresolver.currentWindow', async () => {
		return await connectCommand(true);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('vscode-testresolver.showLog', () => {
		if (outputChannel) {
			outputChannel.show();
		}
	}));
}
