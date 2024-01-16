import * as vscode from 'vscode';
import * as common from './common';
import { context } from './extension';

// remote authority resolver
function doResolve(authority: string): vscode.ResolvedAuthority {
    const remoteInfo = common.RemoteInfo.fromFullAuthority(authority);

    context.subscriptions.push(vscode.workspace.registerResourceLabelFormatter(
        {
            scheme: "vscode-remote",
            authority: "tcpreh+*",
            formatting: {
                label: "${path}",
                separator: "/",
                tildify: true,
                workspaceSuffix: `REH: ${remoteInfo.displayLabel}`,
                workspaceTooltip: "Remote Extension Host"
            }
        }
    ));

    if (!remoteInfo.connectionToken) {
        console.log("No connection token specified.");
    }

    return new vscode.ResolvedAuthority(remoteInfo.host, remoteInfo.port, remoteInfo.connectionToken);
}

export class AuthorityResolver implements vscode.RemoteAuthorityResolver {
    resolve(authority: string): vscode.ResolvedAuthority {
        return doResolve(authority);
    }
}
