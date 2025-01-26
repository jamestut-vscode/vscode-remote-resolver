import * as vscode from 'vscode';
import * as common from './common';
import * as net from 'net';
import { getContext } from './extension';

class MySocket implements vscode.ManagedMessagePassing {
    private readonly eeDidReceiveMessage = new vscode.EventEmitter<Uint8Array>();
    onDidReceiveMessage: vscode.Event<Uint8Array>;

    private readonly eeDidClose = new vscode.EventEmitter<Error | undefined>();
    onDidClose: vscode.Event<Error | undefined>;

    private readonly eeDidEnd = new vscode.EventEmitter<void>();
    onDidEnd: vscode.Event<void>;

    constructor(private sock: net.Socket) {
        this.onDidReceiveMessage = this.eeDidReceiveMessage.event;
        this.onDidClose = this.eeDidClose.event;
        this.onDidEnd = this.eeDidEnd.event;

        this.sock.on('data', (data) => {
            this.eeDidReceiveMessage.fire(data);
        });

        let sockErr: Error | undefined;
        this.sock.on('error', (err) => {
            sockErr = err;
        });

        this.sock.on('close', (hadError) => {
            this.eeDidClose.fire(hadError ? sockErr : undefined);
        });

        this.sock.on('end', this.eeDidEnd.fire);
    }

    send(data: Uint8Array): void {
        this.sock.write(data);
    }

    end(): void {
        this.sock.end();
    }
}

function makeConnection(host: string, port: number): Promise<vscode.ManagedMessagePassing> {
    return new Promise<vscode.ManagedMessagePassing>((resolve, reject) => {
        const sock = net.createConnection({ host: host, port: port }, () => {
            sock.off('error', reject);
            resolve(new MySocket(sock));
        });

        // Disable Nagle's algorithm.
        sock.setNoDelay(true);
        // on connectivity error, reject the promise
        sock.once('error', reject);
    });
}

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
                workspaceTooltip: "Remote Extension Host"
            }
        }
    ));

    if (!remoteInfo.connectionToken) {
        console.log("No connection token specified.");
    }


    return new vscode.ManagedResolvedAuthority(
        () => { return makeConnection(remoteInfo.host, remoteInfo.port) },
        remoteInfo.connectionToken
    );
}

export class AuthorityResolver implements vscode.RemoteAuthorityResolver {
    resolve(authority: string): vscode.ManagedResolvedAuthority {
        return doResolve(authority);
    }
}
