import { decodeFromBase36 } from './baseCoder';
import * as common from './common';
import * as tm from './transport/meta';

const separatorRe = /(?<!\\)\+/g;

export function remoteFromAddress(address: string, label?: string): common.RemoteInfo {
    // address consists of:
    // transport method+address/command+connection token
    const addrComponents = address.split(separatorRe, 4);
    if (addrComponents.length >= 4) {
        throw new Error("Too many components in the address");
    }
    if (!tm.SupportedTransportMethod.has(addrComponents[0])) {
        throw new Error("Unsupported transport method");
    }
    if (addrComponents.length <= 1) {
        throw new Error("Address component is empty");
    }
    const [transportMethod, addressComponent, connectionToken] = addrComponents;

    let transportInfo: tm.TransportInfo;
    switch (transportMethod) {
        case tm.TransportMethod.TCP:
            transportInfo = tm.TcpTransportInfo.fromAddress(addressComponent);
            break;
        case tm.TransportMethod.UDS:
            transportInfo = tm.UdsTransportInfo.fromAddress(addressComponent);
            break;
        case tm.TransportMethod.PIPE:
            transportInfo = tm.PipeTransportInfo.fromAddress(addressComponent);
            break;
        default:
            throw new Error("Not implemented");
    }

    return new common.RemoteInfo(transportMethod, transportInfo, label, connectionToken);
}

export function remoteFromFullAuthority(fullAuth: string): common.RemoteInfo {
    // full authority consists of:
    // protocol (always 'jra')+transport method+encodeURIComponent(address part)+connection token+label
    const faComponents = fullAuth.split('+', 6);

    switch (faComponents.length) {
        case 4:
        case 5:
            break;
        default:
            throw new Error("Invalid remote authority");
    }

    let protocol: string;
    let transportMethod: string;
    let encodedAddress: string;
    let connectionToken: string | undefined;
    let label: string | undefined;
    [protocol, transportMethod, encodedAddress, connectionToken, label] = faComponents;

    if (protocol !== 'jra') {
        throw new Error("Invalid remote authority protocol");
    }

    let addressComp = [transportMethod, decodeFromBase36(encodedAddress)];
    // do not include empty connection token to remoteFromAddress
    if (connectionToken) {
        addressComp.push(connectionToken);
    }
    return remoteFromAddress(addressComp.join("+"), label);
}
