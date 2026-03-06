import {Wallet} from "@coral-xyz/anchor/dist/cjs/provider";
import {Keypair, PublicKey, Transaction, VersionedTransaction} from "@solana/web3.js";

/**
 * Keypair-based wallet implementation for Solana
 * @category Wallets
 */
export class SolanaKeypairWallet implements Wallet {

    /**
     * Underlying signer keypair.
     */
    readonly payer: Keypair;

    constructor(payer: Keypair) {
        this.payer = payer;
    }

    /**
     * Public key of the wrapped payer keypair.
     */
    get publicKey(): PublicKey {
        return this.payer.publicKey;
    }

    /**
     * Signs all provided transactions with the wrapped keypair.
     *
     * @param txs Transactions to sign
     */
    signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
        txs.forEach((tx) => {
            if(tx instanceof Transaction) {
                tx.partialSign(this.payer);
            } else if(tx instanceof VersionedTransaction) {
                tx.sign([this.payer]);
            }
        });
        return Promise.resolve(txs);
    }

    /**
     * Signs a single transaction with the wrapped keypair.
     *
     * @param tx Transaction to sign
     */
    signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
        if(tx instanceof Transaction) {
            tx.partialSign(this.payer);
        } else if(tx instanceof VersionedTransaction) {
            tx.sign([this.payer]);
        }
        return Promise.resolve(tx);
    }

}
