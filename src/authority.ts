import * as vscode from 'vscode';
import * as tm from './transport/meta';
import * as remoteParse from './remoteParse';
import { getContext } from './extension';
import * as socketTransport from './transport/socket';
import * as pipeTransport from './transport/pipe';

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
                workspaceSuffix: `REH: ${remoteInfo.displayLabel}`,
                workspaceTooltip: "Remote Extension Host (Experimental)"
            }
        }
    ));

    if (!remoteInfo.connectionToken) {
        console.log("No connection token specified.");
    }

    switch (remoteInfo.transport) {
        case tm.TransportMethod.TCP:
        case tm.TransportMethod.UDS:
            return socketTransport.makeAuthority(
                remoteInfo.transport,
                remoteInfo.transportinfo,
                remoteInfo.connectionToken
            );
        case tm.TransportMethod.PIPE:
            return pipeTransport.makeAuthority(
                remoteInfo.transportinfo as tm.PipeTransportInfo,
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
