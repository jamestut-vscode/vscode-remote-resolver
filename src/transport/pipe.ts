import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as tm from './meta';

export function makeAuthority(
    transportInfo: tm.PipeTransportInfo,
    connectionToken: string | undefined
) {
    return new vscode.ManagedResolvedAuthority(
        () => invokeTransport(transportInfo.args), connectionToken);
}

async function invokeTransport(args: string[]) {
    return new PipeTransport(args);
}

class PipeTransport implements vscode.ManagedMessagePassing {
    private readonly eeDidReceiveMessage = new vscode.EventEmitter<Uint8Array>();
    onDidReceiveMessage: vscode.Event<Uint8Array>;

    private readonly eeDidClose = new vscode.EventEmitter<Error | undefined>();
    onDidClose: vscode.Event<Error | undefined>;

    private readonly eeDidEnd = new vscode.EventEmitter<void>();
    onDidEnd: vscode.Event<void>;

    private readonly child: cp.ChildProcess;

    constructor(cmdargs: string[]) {
        this.onDidReceiveMessage = this.eeDidReceiveMessage.event;
        this.onDidClose = this.eeDidClose.event;
        this.onDidEnd = this.eeDidEnd.event;

        this.child = cp.spawn(cmdargs[0], cmdargs.slice(1), {
            // stdin: pipe | stdout: pipe | stderr: parent's
            stdio: ['pipe', 'pipe', 'inherit']
        });
        this.child.stdout!.on('data', (data) => {
            this.eeDidReceiveMessage.fire(data);
        });
        this.child.stdout!.on('close', () => {
            this.eeDidEnd.fire();
            this.eeDidClose.fire(undefined);
        });
    }

    send(data: Uint8Array): void {
        this.child.stdin!.write(data);
    }

    end(): void {
        this.child.kill('SIGTERM');
    }
}
