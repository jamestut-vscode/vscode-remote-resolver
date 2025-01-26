import * as vscode from 'vscode';
import * as net from 'net';

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

export function connect(host: string, port: number): Promise<vscode.ManagedMessagePassing> {
    return new Promise<vscode.ManagedMessagePassing>((resolve, reject) => {
        const sock = net.createConnection({ host: host, port: port }, () => {
            sock.off('error', reject);
            resolve(new TcpSocket(sock));
        });

        // Disable Nagle's algorithm.
        sock.setNoDelay(true);
        // on connectivity error, reject the promise
        sock.once('error', reject);
    });
}
