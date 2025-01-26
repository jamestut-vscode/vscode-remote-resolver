import * as vscode from 'vscode';
import * as common from './common';
import { getContext } from './extension';
import * as tcpTransport from './transport/tcp';

// remote authority resolver
function doResolve(authority: string): vscode.ManagedResolvedAuthority {
    const remoteInfo = common.RemoteInfo.fromFullAuthority(authority);
    const context = getContext();

    context.subscriptions.push(vscode.workspace.registerResourceLabelFormatter(
        {
            scheme: "vscode-remote",
            authority: "tcpreh+*",
            formatting: {
                label: "${path}",
                separator: "/",
                tildify: true,
                workspaceSuffix: `REHexp: ${remoteInfo.displayLabel}`,
                workspaceTooltip: "Remote Extension Host (Experimental)"
            }
        }
    ));

    if (!remoteInfo.connectionToken) {
        console.log("No connection token specified.");
    }


    return new vscode.ManagedResolvedAuthority(
        () => { return tcpTransport.connect(remoteInfo.host, remoteInfo.port) },
        remoteInfo.connectionToken
    );
}

export class AuthorityResolver implements vscode.RemoteAuthorityResolver {
    resolve(authority: string): vscode.ManagedResolvedAuthority {
        return doResolve(authority);
    }
}
