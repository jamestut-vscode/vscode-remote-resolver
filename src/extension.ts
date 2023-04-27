/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	function doResolve(authority: string): vscode.ResolvedAuthority {
		let [host, port, connectionToken] = authority.split("+", 2)[1].split(":", 3);
		if (!port) {
			throw new Error("Port number is undefined");
		}

		context.subscriptions.push(vscode.workspace.registerResourceLabelFormatter(
			{
				scheme: "vscode-remote",
				authority: "tcpreh+*",
				formatting: {
					label: "${path}",
					separator: "/",
					tildify: true,
					workspaceSuffix: `REH: ${host}`,
					workspaceTooltip: "Remote Extension Host"
				}
			}
		));

		if (connectionToken) {
			console.log(`Using connection token: '${connectionToken}'`);
		} else {
			console.log("No connection token specified.");
		}

		return new vscode.ResolvedAuthority(host, parseInt(port), connectionToken);
	}

	const authorityResolverDisposable = vscode.workspace.registerRemoteAuthorityResolver('tcpreh', {
		resolve(_authority: string): vscode.ResolvedAuthority {
			console.log("Calling doResolve ...");
			return doResolve(_authority);
		}
	});
	context.subscriptions.push(authorityResolverDisposable);

	async function connectCommand(reuseWindow: boolean) {
		const keyName = "lastEnteredHost";
		let currValue: string | undefined = context.globalState.get<string>(keyName);
		currValue = await vscode.window.showInputBox({
			title: "Enter remote target (only TCP is supported)",
			placeHolder: "hostname:port(:connectionToken)",
			value: currValue
		});
		if (!currValue)
			return;
		context.globalState.update(keyName, currValue);
		return vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: `tcpreh+${currValue}`, reuseWindow });
	}

	context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.newWindow', async () => {
		return await connectCommand(false);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('remote-resolver.currentWindow', async () => {
		return await connectCommand(true);
	}));
}
