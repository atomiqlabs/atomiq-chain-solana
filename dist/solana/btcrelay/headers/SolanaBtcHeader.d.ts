/// <reference types="node" />
import { BtcHeader } from "@atomiqlabs/base";
import { Buffer } from "buffer";
type SolanaBtcHeaderType = {
    version: number;
    reversedPrevBlockhash: number[];
    merkleRoot: number[];
    timestamp: number;
    nbits: number;
    nonce: number;
    hash?: Buffer;
};
export declare class SolanaBtcHeader implements BtcHeader {
    version: number;
    reversedPrevBlockhash: number[];
    merkleRoot: number[];
    timestamp: number;
    nbits: number;
    nonce: number;
    hash?: Buffer;
    constructor(obj: SolanaBtcHeaderType);
    getMerkleRoot(): Buffer;
    getNbits(): number;
    getNonce(): number;
    getReversedPrevBlockhash(): Buffer;
    getTimestamp(): number;
    getVersion(): number;
}
export {};
