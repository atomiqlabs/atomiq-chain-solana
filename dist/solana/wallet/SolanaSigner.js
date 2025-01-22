"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSigner = void 0;
class SolanaSigner {
    constructor(wallet, keypair) {
        this.wallet = wallet;
        this.keypair = keypair;
    }
    getPublicKey() {
        return this.wallet.publicKey;
    }
    getAddress() {
        return this.wallet.publicKey.toString();
    }
}
exports.SolanaSigner = SolanaSigner;
