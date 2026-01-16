"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaBtcHeader = void 0;
const buffer_1 = require("buffer");
/**
 * @category BTC Relay
 */
class SolanaBtcHeader {
    constructor(obj) {
        this.version = obj.version;
        this.reversedPrevBlockhash = obj.reversedPrevBlockhash;
        this.merkleRoot = obj.merkleRoot;
        this.timestamp = obj.timestamp;
        this.nbits = obj.nbits;
        this.nonce = obj.nonce;
        this.hash = obj.hash;
    }
    getMerkleRoot() {
        return buffer_1.Buffer.from(this.merkleRoot);
    }
    getNbits() {
        return this.nbits;
    }
    getNonce() {
        return this.nonce;
    }
    getReversedPrevBlockhash() {
        return buffer_1.Buffer.from(this.reversedPrevBlockhash);
    }
    getTimestamp() {
        return this.timestamp;
    }
    getVersion() {
        return this.version;
    }
}
exports.SolanaBtcHeader = SolanaBtcHeader;
