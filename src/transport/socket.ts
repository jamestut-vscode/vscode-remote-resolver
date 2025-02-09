import * as vscode from 'vscode';
import * as net from 'net';
import * as tm from './meta';

export function makeAuthority(
    transportMethod: tm.TransportMethod,
    transportInfo: tm.TransportInfo,
    connectionToken: string | undefined
) {
    return new vscode.ManagedResolvedAuthority(
        () => connect(transportMethod, transportInfo), connectionToken);
}

class TcpSocket implements vscode.ManagedMessagePassing {
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

function makeTcpSocket(transportInfo: tm.TransportInfo, connectionListener?: () => void): net.Socket {
    const ti = transportInfo as tm.TcpTransportInfo;

    // node's socket for IPv6 doesn't like the []
    let host = ti.host;
    if (host.startsWith('[') && host.endsWith(']')) {
        host = host.slice(1, -1);
    }

    return net.createConnection({
        host: host,
        port: ti.port
    }, connectionListener);
}

function makeUdsSocket(transportInfo: tm.TransportInfo, connectionListener?: () => void): net.Socket {
    const ti = transportInfo as tm.UdsTransportInfo;

    return net.createConnection({
        path: ti.path
    }, connectionListener);
}

export function connect(transportMethod: tm.TransportMethod, transportInfo: tm.TransportInfo): Promise<vscode.ManagedMessagePassing> {
    return new Promise<vscode.ManagedMessagePassing>((resolve, reject) => {
        let sockMakerFn: (transportInfo: tm.TransportInfo, connectionListener?: () => void) => net.Socket;
        switch (transportMethod) {
            case tm.TransportMethod.TCP:
                sockMakerFn = makeTcpSocket;
                break;
            case tm.TransportMethod.UDS:
                sockMakerFn = makeUdsSocket;
                break;
            default:
                throw new Error(`Transport method '${transportMethod} is not supported on this connector.'`)
        }

        const sock = sockMakerFn(transportInfo, () => {
            sock.off('error', reject);
            resolve(new TcpSocket(sock));
        });

        // Disable Nagle's algorithm.
        sock.setNoDelay(true);
        // on connectivity error, reject the promise
        sock.once('error', reject);
    });
}
