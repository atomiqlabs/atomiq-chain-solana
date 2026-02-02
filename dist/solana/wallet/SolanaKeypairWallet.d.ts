import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
/**
 * Keypair-based wallet implementation for Solana
 * @category Wallets
 */
export declare class SolanaKeypairWallet implements Wallet {
    readonly payer: Keypair;
    constructor(payer: Keypair);
    get publicKey(): PublicKey;
    signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
    signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
}
