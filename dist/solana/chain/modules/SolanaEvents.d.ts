import { SolanaModule } from "../SolanaModule";
import { ConfirmedSignatureInfo, ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";
export declare class SolanaEvents extends SolanaModule {
    readonly LOG_FETCH_LIMIT = 500;
    private usingHeliusTFA;
    /**
     * Gets the signatures for a given topicKey public key, if lastProcessedSignature is specified, it fetches only
     *  the signatures before this signature
     *
     * @param topicKey
     * @param logFetchLimit
     * @param lastProcessedSignature
     * @private
     */
    private getSignatures;
    /**
     * Implements Helius getTransactionsForAddress RPC API
     *
     * @param account
     * @param options
     * @param commitment
     */
    getTransactionsForAddress(account: PublicKey, options?: {
        paginationToken?: string;
        filters?: {
            slot?: {
                gte?: number;
                lte?: number;
                gt?: number;
                lt?: number;
            };
            blockTime?: {
                gte?: number;
                lte?: number;
                gt?: number;
                lt?: number;
                eq?: number;
            };
            signature?: {
                gte?: number;
                lte?: number;
                gt?: number;
                lt?: number;
                eq?: number;
            };
            status?: "succeeded" | "failed" | "any";
        };
    }, commitment?: "finalized" | "confirmed" | "processed"): Promise<{
        data: ParsedTransactionWithMeta[];
        paginationToken?: string;
    } | null>;
    private _findInTxsTFA;
    /**
     * Runs a search backwards in time, processing transaction signatures for a specific topic public key
     *
     * @param topicKey
     * @param processor called for every batch of returned signatures, should return a value if the correct signature
     *  was found, or null if the search should continue
     * @param abortSignal
     * @param logFetchLimit
     * @param startBlockheight
     */
    private _findInSignatures;
    findInSignatures<T>(topicKey: PublicKey, processor: (data: {
        signatures?: ConfirmedSignatureInfo[];
        txs?: ParsedTransactionWithMeta[];
    }) => Promise<T | undefined | null>, abortSignal?: AbortSignal, logFetchLimit?: number, startBlockheight?: number): Promise<T | null>;
}
