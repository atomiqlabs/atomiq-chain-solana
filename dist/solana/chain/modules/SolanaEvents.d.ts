import { SolanaModule } from "../SolanaModule";
import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
export declare class SolanaEvents extends SolanaModule {
    readonly LOG_FETCH_LIMIT = 500;
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
     * Runs a search backwards in time, processing transaction signatures for a specific topic public key
     *
     * @param topicKey
     * @param processor called for every batch of returned signatures, should return a value if the correct signature
     *  was found, or null if the search should continue
     * @param abortSignal
     * @param logFetchLimit
     */
    findInSignatures<T>(topicKey: PublicKey, processor: (signatures: ConfirmedSignatureInfo[]) => Promise<T | null | undefined>, abortSignal?: AbortSignal, logFetchLimit?: number): Promise<T | null>;
}
