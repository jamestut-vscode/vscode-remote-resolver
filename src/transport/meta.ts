export enum TransportMethod {
    TCP = "tcp",
    UDS = "uds",
    PIPE = "pipe",
}

export const SupportedTransportMethod = new Set<string>(Object.values(TransportMethod));

export interface TransportInfo {
    readonly authorityPart: string;

    toJSON(): any;
}

export class TcpTransportInfo implements TransportInfo {
    public readonly authorityPart: string;

    constructor(
        public readonly host: string,
        public readonly port: number,
    ) {
        if (!host.length) {
            throw new Error("Host part is empty");
        }

        if (host.indexOf(":") >= 0) {
            // IPv6 address
            if (!host.startsWith('[') && !host.endsWith(']')) {
                host = `[${host}]`;
            }
        }

        if (port < 0 || port > 0xFFFF) {
            throw new Error("Invalid port number");
        }

        this.authorityPart = [host, port].join(":");
    }

    static fromAddress(addrComponent: string): TcpTransportInfo {
        const spltIndex = addrComponent.lastIndexOf(':');
        if (spltIndex < 0) {
            throw new Error("Address must consists of hostname and port number");
        }
        const hostPart = addrComponent.substring(0, spltIndex);
        const portPart = parseInt(addrComponent.substring(spltIndex + 1));
        if (isNaN(portPart)) {
            throw new Error("Port must be an integer");
        }
        return new TcpTransportInfo(hostPart, portPart);
    }

    static fromJSON(obj: any): TransportInfo {
        return new TcpTransportInfo(obj.host, obj.port);
    }

    toJSON() {
        return {
            host: this.host,
            port: this.port
        }
    }
}

export class UdsTransportInfo implements TransportInfo {
    public readonly authorityPart: string;

    constructor(public readonly path: string) {
        if (!path) {
            throw new Error("Path is empty");
        }
        if (!path.startsWith("/")) {
            throw new Error("Must be an absolute path");
        }
        this.authorityPart = path;
    }

    static fromAddress(addrComponent: string): UdsTransportInfo {
        return new UdsTransportInfo(addrComponent);
    }

    static fromJSON(obj: any): TransportInfo {
        return new UdsTransportInfo(obj.path);
    }

    toJSON() {
        return {
            path: this.path
        }
    }
}

class CommandLineParserIterator implements Iterable<string> {
    // RE to split command line by its argument components
    private readonly argPatt = /\s*(?:"((?:\\"|[^"])*)"|([^\s"]+))\s*/g;
    // RE to unescape escaped quotes
    private static readonly quotPatt = /\\"/g;

    constructor(private commandLine: string) { }

    [Symbol.iterator](): Iterator<string> {
        return {
            next: (): IteratorResult<string> => {
                const match = this.argPatt.exec(this.commandLine);
                let ret: string | undefined;

                if (match !== null) {
                    if (match[1] !== undefined) {
                        // Quoted argument: replace escaped quotes
                        ret = match[1].replace(CommandLineParserIterator.quotPatt, '"');
                    } else if (match[2] !== undefined) {
                        // Unquoted argument
                        ret = match[2];
                    }
                }

                return ret !== undefined ? {value: ret} : {value: undefined, done: true};
            }
        }
    }
}

export class PipeTransportInfo implements TransportInfo {
    private _authorityPart: string | undefined;

    private static readonly escapeCheckPatt = /[\s"]/;
    private static readonly quotPatt = /"/g;

    constructor(public readonly args: string[]) {}

    get authorityPart(): string {
        if (this._authorityPart === undefined) {
            this._authorityPart = PipeTransportInfo.flatten(this.args);
        }
        return this._authorityPart;
    }

    toJSON() {
        return { args: this.args }
    }

    static fromAddress(addrComponent: string): PipeTransportInfo {
        return new PipeTransportInfo(PipeTransportInfo.parse(addrComponent));
    }

    static fromJSON(obj: any): TransportInfo {
        return new PipeTransportInfo(obj.args);
    }

    static parse(cmdline: string): string[] {
        const ret = [...new CommandLineParserIterator(cmdline)];
        if (!ret.length) {
            throw new Error("Command line is empty");
        }
        return ret;
    }

    static flatten(args: string[]): string {
        const ret: string[] = [];
        for (let arg of args) {
            if (PipeTransportInfo.escapeCheckPatt.test(arg)) {
                arg = `"${arg.replace(PipeTransportInfo.quotPatt, '\\"')}"`
            }
            ret.push(arg);
        }
        return ret.join(" ");
    }
}
