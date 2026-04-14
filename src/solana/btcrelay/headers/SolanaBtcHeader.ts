import {BtcHeader} from "@atomiqlabs/base";
import {Buffer} from "buffer";

export type SolanaBtcHeaderType = {
    version: number,
    reversedPrevBlockhash: number[],
    merkleRoot: number[],
    timestamp: number,
    nbits: number,
    nonce: number,
    hash: Buffer
}

/**
 * Represents bitcoin blockheader data to be submitted to the Solana BTC relay program.
 *
 * @category BTC Relay
 */
export class SolanaBtcHeader implements BtcHeader {

    /**
     * Version field of the blockheader.
     */
    private readonly version: number;
    /**
     * Previous block hash in little-endian representation.
     */
    private readonly reversedPrevBlockhash: number[];
    /**
     * Merkle root in little-endian representation.
     */
    private readonly merkleRoot: number[];
    /**
     * Block timestamp in UNIX seconds.
     */
    private readonly timestamp: number;
    /**
     * Compact target (`nBits`) field.
     */
    private readonly nbits: number;
    /**
     * Nonce field.
     */
    private readonly nonce: number;
    /**
     * Reversed block hash bytes.
     */
    private readonly hash: Buffer;

    /**
     * Constructs the bitcoin blockheader
     *
     * @param obj Blockheader fields
     *
     * @internal
     */
    constructor(obj: SolanaBtcHeaderType) {
        this.version = obj.version;
        this.reversedPrevBlockhash = obj.reversedPrevBlockhash;
        this.merkleRoot = obj.merkleRoot;
        this.timestamp = obj.timestamp;
        this.nbits = obj.nbits;
        this.nonce = obj.nonce;
        this.hash = obj.hash;
    }

    /**
     * @inheritDoc
     */
    getMerkleRoot(): Buffer {
        return Buffer.from(this.merkleRoot);
    }

    /**
     * @inheritDoc
     */
    getNbits(): number {
        return this.nbits;
    }

    /**
     * @inheritDoc
     */
    getNonce(): number {
        return this.nonce;
    }

    /**
     * @inheritDoc
     */
    getReversedPrevBlockhash(): Buffer {
        return Buffer.from(this.reversedPrevBlockhash);
    }

    /**
     * @inheritDoc
     */
    getTimestamp(): number {
        return this.timestamp;
    }

    /**
     * @inheritDoc
     */
    getVersion(): number {
        return this.version;
    }

    /**
     * Returns block hash bytes in little-endian representation.
     */
    getHash(): Buffer {
        return this.hash;
    }

}
