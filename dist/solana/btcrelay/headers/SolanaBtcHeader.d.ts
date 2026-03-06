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
    private readonly version;
    /**
     * Previous block hash in little-endian representation.
     */
    private readonly reversedPrevBlockhash;
    /**
     * Merkle root in little-endian representation.
     */
    private readonly merkleRoot;
    /**
     * Block timestamp in UNIX seconds.
     */
    private readonly timestamp;
    /**
     * Compact target (`nBits`) field.
     */
    private readonly nbits;
    /**
     * Nonce field.
     */
    private readonly nonce;
    /**
     * Reversed block hash bytes.
     */
    private readonly hash;
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
    /**
     * Returns block hash bytes in little-endian representation.
     */
    getHash(): Buffer;
}
export {};
