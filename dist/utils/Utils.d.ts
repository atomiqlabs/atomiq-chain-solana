import { PublicKey, Transaction } from "@solana/web3.js";
import * as BN from "bn.js";
export declare function timeoutPromise(timeoutMillis: number, abortSignal?: AbortSignal): Promise<void>;
export declare function onceAsync<T>(executor: () => Promise<T>): () => Promise<T>;
export declare function getLogger(prefix: string): {
    debug: (msg: any, ...args: any[]) => false | void;
    info: (msg: any, ...args: any[]) => false | void;
    warn: (msg: any, ...args: any[]) => false | void;
    error: (msg: any, ...args: any[]) => false | void;
};
export declare function tryWithRetries<T>(func: () => Promise<T>, retryPolicy?: {
    maxRetries?: number;
    delay?: number;
    exponential?: boolean;
}, errorAllowed?: (e: any) => boolean, abortSignal?: AbortSignal): Promise<T>;
export declare class SolanaTxUtils {
    private static LOW_VALUE;
    private static HIGH_VALUE;
    /**
     * Compact u16 array header size
     * @param n elements in the compact array
     * @returns size in bytes of array header
     */
    private static compactHeader;
    /**
     * Compact u16 array size
     * @param n elements in the compact array
     * @param size bytes per each element
     * @returns size in bytes of array
     */
    private static compactArraySize;
    /**
     * Returns # number of non-compute budget related instructions
     *
     * @param tx
     */
    static getNonComputeBudgetIxs(tx: Transaction): number;
    /**
     * @param tx a solana transaction
     * @param feePayer the publicKey of the signer
     * @returns size in bytes of the transaction
     */
    static getTxSize(tx: Transaction, feePayer: PublicKey): number;
}
export declare function toClaimHash(paymentHash: string, nonce: bigint, confirmations: number): string;
export declare function fromClaimHash(claimHash: string): {
    paymentHash: string;
    nonce: BN;
    confirmations: number;
};
export declare function toEscrowHash(paymentHash: string, sequence: BN): string;
export declare function toBN(value: bigint): BN;
export declare function toBigInt(value: BN): bigint;
