import * as vscode from 'vscode';
import * as common from './common';
import * as net from 'net';
import { getContext } from './extension';

/** Encodes a buffer to a base64 string. */
export function encodeBase64(buffer: Uint8Array, padded = true) {
    const dictionary = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let output = '';

    const remainder = buffer.byteLength % 3;

    let i = 0;
    for (; i < buffer.byteLength - remainder; i += 3) {
        const a = buffer[i + 0];
        const b = buffer[i + 1];
        const c = buffer[i + 2];

        output += dictionary[a >>> 2];
        output += dictionary[(a << 4 | b >>> 4) & 0b111111];
        output += dictionary[(b << 2 | c >>> 6) & 0b111111];
        output += dictionary[c & 0b111111];
    }

    if (remainder === 1) {
        const a = buffer[i + 0];
        output += dictionary[a >>> 2];
        output += dictionary[(a << 4) & 0b111111];
        if (padded) { output += '=='; }
    } else if (remainder === 2) {
        const a = buffer[i + 0];
        const b = buffer[i + 1];
        output += dictionary[a >>> 2];
        output += dictionary[(a << 4 | b >>> 4) & 0b111111];
        output += dictionary[(b << 2) & 0b111111];
        if (padded) { output += '='; }
    }

    return output;
}

// @ts-ignore
const makeRawSocketHeaders = (path: string, query: string) => {
    // https://tools.ietf.org/html/rfc6455#section-4
    const buffer = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        buffer[i] = Math.round(Math.random() * 256);
    }
    const nonce = encodeBase64(buffer);

    const headers = [
        `GET ws://localhost${path}?${query}&skipWebSocketFrames=true HTTP/1.1`,
        `Connection: Upgrade`,
        `Upgrade: websocket`,
        `Sec-WebSocket-Key: ${nonce}`
    ];

    return headers.join('\r\n') + '\r\n\r\n';
};

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
