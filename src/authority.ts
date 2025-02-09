import * as vscode from 'vscode';
import * as common from './common';
import * as remoteParse from './remoteParse';
import { getContext } from './extension';
import * as tcpTransport from './transport/tcp';

// remote authority resolver
function doResolve(authority: string): vscode.ManagedResolvedAuthority {
    const remoteInfo = remoteParse.remoteFromFullAuthority(authority);
    const context = getContext();

    context.subscriptions.push(vscode.workspace.registerResourceLabelFormatter(
        {
            scheme: "vscode-remote",
            authority: "jra+*",
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

    switch (remoteInfo.transport) {
        case common.TransportMethod.TCP:
            return tcpTransport.makeAuthority(
                remoteInfo.transportinfo as common.TcpTransportInfo,
                remoteInfo.connectionToken
            );
        default:
            throw new Error(`Transport method '${remoteInfo.transport}' is not implemented!`);
    }
}

export class AuthorityResolver implements vscode.RemoteAuthorityResolver {
    resolve(authority: string): vscode.ManagedResolvedAuthority {
        return doResolve(authority);
    }
}
