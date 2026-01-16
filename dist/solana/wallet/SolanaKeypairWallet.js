"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaKeypairWallet = void 0;
const web3_js_1 = require("@solana/web3.js");
/**
 * Keypair-based wallet implementation for Solana
 * @category Wallets
 */
class SolanaKeypairWallet {
    constructor(payer) {
        this.payer = payer;
    }
    get publicKey() {
        return this.payer.publicKey;
    }
    signAllTransactions(txs) {
        txs.forEach((tx) => {
            if (tx instanceof web3_js_1.Transaction) {
                tx.partialSign(this.payer);
            }
            else if (tx instanceof web3_js_1.VersionedTransaction) {
                tx.sign([this.payer]);
            }
        });
        return Promise.resolve(txs);
    }
    signTransaction(tx) {
        if (tx instanceof web3_js_1.Transaction) {
            tx.partialSign(this.payer);
        }
        else if (tx instanceof web3_js_1.VersionedTransaction) {
            tx.sign([this.payer]);
        }
        return Promise.resolve(tx);
    }
}
exports.SolanaKeypairWallet = SolanaKeypairWallet;
