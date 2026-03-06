/// <reference types="node" />
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
    hash: Buffer;
};
/**
 * Represents a bitcoin blockheader struct to be submitted to the Solana BTC relay program.
 *
 * @category BTC Relay
 */
export declare class SolanaBtcHeader implements BtcHeader {
    /**
     * Version field of the blockheader.
     */
    version: number;
    /**
     * Previous block hash in little-endian representation.
     */
    reversedPrevBlockhash: number[];
    /**
     * Merkle root in little-endian representation.
     */
    merkleRoot: number[];
    /**
     * Block timestamp in UNIX seconds.
     */
    timestamp: number;
    /**
     * Compact target (`nBits`) field.
     */
    nbits: number;
    /**
     * Nonce field.
     */
    nonce: number;
    /**
     * Reversed block hash bytes.
     */
    hash: Buffer;
    /**
     * Constructs the bitcoin blockheader from Solana account/event data.
     *
     * @param obj Decoded blockheader fields
     */
    constructor(obj: SolanaBtcHeaderType);
    /**
     * @inheritDoc
     */
    getMerkleRoot(): Buffer;
    /**
     * @inheritDoc
     */
    getNbits(): number;
    /**
     * @inheritDoc
     */
    getNonce(): number;
    /**
     * @inheritDoc
     */
    getReversedPrevBlockhash(): Buffer;
    /**
     * @inheritDoc
     */
    getTimestamp(): number;
    /**
     * @inheritDoc
     */
    getVersion(): number;
}
export {};
