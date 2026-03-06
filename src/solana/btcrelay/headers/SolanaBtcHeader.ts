import {BtcHeader} from "@atomiqlabs/base";
import {Buffer} from "buffer";

type SolanaBtcHeaderType = {
    version: number,
    reversedPrevBlockhash: number[],
    merkleRoot: number[],
    timestamp: number,
    nbits: number,
    nonce: number,
    hash: Buffer
}

/**
 * Represents a bitcoin blockheader struct to be submitted to the Solana BTC relay program.
 *
 * @category BTC Relay
 */
export class SolanaBtcHeader implements BtcHeader {

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

}
