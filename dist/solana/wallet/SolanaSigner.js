"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSigner = void 0;
/**
 * Solana signer implementation wrapping an Anchor Wallet
 * @category Wallets
 */
class SolanaSigner {
    constructor(wallet, keypair) {
        this.type = "AtomiqAbstractSigner";
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
