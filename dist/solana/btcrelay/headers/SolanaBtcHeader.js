"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaBtcHeader = void 0;
const buffer_1 = require("buffer");
/**
 * Represents a bitcoin blockheader struct to be submitted to the Solana BTC relay program.
 *
 * @category BTC Relay
 */
class SolanaBtcHeader {
    /**
     * Constructs the bitcoin blockheader from Solana account/event data.
     *
     * @param obj Decoded blockheader fields
     */
    constructor(obj) {
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
    getMerkleRoot() {
        return buffer_1.Buffer.from(this.merkleRoot);
    }
    /**
     * @inheritDoc
     */
    getNbits() {
        return this.nbits;
    }
    /**
     * @inheritDoc
     */
    getNonce() {
        return this.nonce;
    }
    /**
     * @inheritDoc
     */
    getReversedPrevBlockhash() {
        return buffer_1.Buffer.from(this.reversedPrevBlockhash);
    }
    /**
     * @inheritDoc
     */
    getTimestamp() {
        return this.timestamp;
    }
    /**
     * @inheritDoc
     */
    getVersion() {
        return this.version;
    }
    /**
     * Returns block hash bytes in little-endian representation.
     */
    getHash() {
        return this.hash;
    }
}
exports.SolanaBtcHeader = SolanaBtcHeader;
