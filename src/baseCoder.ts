/**
 * Helper function to convert a Uint8Array to a hexadecimal string.
 * @param bytes The byte array to convert.
 * @returns The hexadecimal string.
 */
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Helper function to convert a hexadecimal string to a Uint8Array.
 * Pads with a leading '0' if hex string length is odd.
 * @param hex The hexadecimal string to convert.
 * @returns The Uint8Array.
 * @throws Error if hex string contains invalid characters.
 */
function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
        hex = '0' + hex;
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.substring(i, i + 2), 16);
        if (isNaN(byte)) {
            throw new Error('Invalid hexadecimal string');
        }
        bytes[i / 2] = byte;
    }
    return bytes;
}

/**
 * Helper function to convert a base36 string to a BigInt.
 * Base36 characters are '0'-'9' and 'a'-'z' (lowercase).
 * @param base36 The base36 string.
 * @returns The BigInt representation.
 * @throws Error if the string contains invalid base36 characters.
 */
function base36ToBigInt(base36: string): bigint {
    let result = 0n;
    for (let i = 0; i < base36.length; i++) {
        const char = base36[i];
        let value: number;
        if (char >= '0' && char <= '9') {
            value = char.charCodeAt(0) - 48; // '0'.charCodeAt(0)
        } else if (char >= 'a' && char <= 'z') {
            value = char.charCodeAt(0) - 87; // 'a'.charCodeAt(0) - 10
        } else {
            throw new Error(`Invalid base36 character: ${char}`);
        }
        result = result * 36n + BigInt(value);
    }
    return result;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Encodes a JavaScript string to a base36 string by first converting the string
 * to its UTF-8 binary representation.
 *
 * @param input The string to encode.
 * @returns The base36 encoded string.
 */
export const encodeToBase36 = (input: string): string => {
    if (typeof input !== 'string') {
        throw new Error("Input must be a string.");
    }
    if (input === "") {
        return "";
    }

    const utf8Bytes = textEncoder.encode(input);

    // Prepend a 0x01 byte to handle leading zeros in the original byte array
    // and to distinguish empty original data from data that results in 0.
    const prependedBytes = new Uint8Array(utf8Bytes.length + 1);
    prependedBytes[0] = 1;
    prependedBytes.set(utf8Bytes, 1);

    const hexString = bytesToHex(prependedBytes);
    const bigIntValue = BigInt('0x' + hexString);

    return bigIntValue.toString(36);
};

/**
 * Decodes a base36 string (encoded with the custom encodeToBase36 function)
 * back to a regular JavaScript string.
 *
 * @param encodedString The base36 encoded string.
 * @returns The decoded JavaScript string.
 * @throws Error if the encoded string is invalid or cannot be decoded.
 */
export const decodeFromBase36 = (encodedString: string): string => {
    if (typeof encodedString !== 'string') {
        throw new Error("Encoded string must be a string.");
    }
    if (encodedString === "") {
        return "";
    }

    try {
        const bigIntValue = base36ToBigInt(encodedString);
        const hexString = bigIntValue.toString(16);

        const prependedBytes = hexToBytes(hexString);

        // The first byte must be the 0x01 we prepended.
        // If not, the encoding is malformed or from a different system.
        if (prependedBytes.length === 0 || prependedBytes[0] !== 1) {
            // If prependedBytes is empty, hexToBytes would have produced an empty array
            // from an empty or invalid hex string. Or if the leading byte is not 1.
            // bigIntValue.toString(16) for 0n is "0", hexToBytes("0") -> hexToBytes("00") -> [0].
            // This scenario should indicate an issue if we expect a prepended '1'.
            // Given our encoding strategy, a non-empty encodedString should not result in
            // a BigInt that, after prepending 0x01, becomes 0 or doesn't start with 0x01.
            throw new Error("Invalid encoded string format: missing leading marker.");
        }

        const originalUtf8Bytes = prependedBytes.slice(1);
        return textDecoder.decode(originalUtf8Bytes);

    } catch (error: any) {
        throw new Error(`Failed to decode base36 string: ${error.message || error}`);
    }
};
