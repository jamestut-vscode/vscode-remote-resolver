export enum TransportMethod {
    TCP = "tcp",
    // UDS = "uds",
    // PIPE = "pipe",
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
