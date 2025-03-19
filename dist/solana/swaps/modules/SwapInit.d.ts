/// <reference types="node" />
import { ParsedAccountsModeBlockResponse, PublicKey } from "@solana/web3.js";
import { SolanaSwapData } from "../SolanaSwapData";
import { SolanaSwapModule } from "../SolanaSwapModule";
import { SolanaTx } from "../../chain/modules/SolanaTransactions";
import { Buffer } from "buffer";
import { SolanaSigner } from "../../wallet/SolanaSigner";
export type SolanaPreFetchVerification = {
    latestSlot?: {
        slot: number;
        timestamp: number;
    };
    transactionSlot?: {
        slot: number;
        blockhash: string;
    };
};
export type SolanaPreFetchData = {
    block: ParsedAccountsModeBlockResponse;
    slot: number;
    timestamp: number;
};
export declare class SwapInit extends SolanaSwapModule {
    readonly SIGNATURE_SLOT_BUFFER = 20;
    readonly SIGNATURE_PREFETCH_DATA_VALIDITY = 5000;
    private static readonly CUCosts;
    /**
     * bare Init action based on the data passed in swapData
     *
     * @param swapData
     * @param timeout
     * @private
     */
    private Init;
    /**
     * InitPayIn action which includes SOL to WSOL wrapping if indicated by the fee rate
     *
     * @param swapData
     * @param timeout
     * @param feeRate
     * @constructor
     * @private
     */
    private InitPayIn;
    /**
     * InitNotPayIn action with additional createAssociatedTokenAccountIdempotentInstruction instruction, such that
     *  a recipient ATA is created if it doesn't exist
     *
     * @param swapData
     * @param timeout
     * @constructor
     * @private
     */
    private InitNotPayIn;
    private Wrap;
    /**
     * Extracts data about SOL to WSOL wrapping from the fee rate, fee rate is used to convey this information from
     *  the user to the intermediary, such that the intermediary creates valid signature for transaction including
     *  the SOL to WSOL wrapping instructions
     *
     * @param feeRate
     * @private
     */
    private extractAtaDataFromFeeRate;
    /**
     * Checks whether a wrap instruction (SOL -> WSOL) should be a part of the signed init message
     *
     * @param swapData
     * @param feeRate
     * @private
     * @returns {boolean} returns true if wrap instruction should be added
     */
    private shouldWrapOnInit;
    /**
     * Returns the transaction to be signed as an initialization signature from the intermediary, also adds
     *  SOL to WSOL wrapping if indicated by the fee rate
     *
     * @param swapData
     * @param timeout
     * @param feeRate
     * @private
     */
    private getTxToSign;
    /**
     * Returns auth prefix to be used with a specific swap, payIn=true & payIn=false use different prefixes (these
     *  actually have no meaning for the smart contract/solana program in the Solana case)
     *
     * @param swapData
     * @private
     */
    private getAuthPrefix;
    /**
     * Returns "processed" slot required for signature validation, uses preFetchedData if provided & valid
     *
     * @param preFetchedData
     * @private
     */
    private getSlotForSignature;
    /**
     * Returns blockhash required for signature validation, uses preFetchedData if provided & valid
     *
     * @param txSlot
     * @param preFetchedData
     * @private
     */
    private getBlockhashForSignature;
    /**
     * Pre-fetches slot & block based on priorly received SolanaPreFetchData, such that it can later be used
     *  by signature verification
     *
     * @param data
     */
    preFetchForInitSignatureVerification(data: SolanaPreFetchData): Promise<SolanaPreFetchVerification>;
    /**
     * Pre-fetches block data required for signing the init message by the LP, this can happen in parallel before
     *  signing takes place making the quoting quicker
     */
    preFetchBlockDataForSignatures(): Promise<SolanaPreFetchData>;
    /**
     * Signs swap initialization authorization, using data from preFetchedBlockData if provided & still valid (subject
     *  to SIGNATURE_PREFETCH_DATA_VALIDITY)
     *
     * @param signer
     * @param swapData
     * @param authorizationTimeout
     * @param feeRate
     * @param preFetchedBlockData
     * @public
     */
    signSwapInitialization(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number, preFetchedBlockData?: SolanaPreFetchData, feeRate?: string): Promise<{
        prefix: string;
        timeout: string;
        signature: string;
    }>;
    /**
     * Checks whether the provided signature data is valid, using preFetchedData if provided and still valid
     *
     * @param swapData
     * @param timeout
     * @param prefix
     * @param signature
     * @param feeRate
     * @param preFetchedData
     * @public
     */
    isSignatureValid(swapData: SolanaSwapData, timeout: string, prefix: string, signature: string, feeRate?: string, preFetchedData?: SolanaPreFetchVerification): Promise<Buffer>;
    /**
     * Gets expiry of the provided signature data, this is a minimum of slot expiry & swap signature expiry
     *
     * @param timeout
     * @param signature
     * @param preFetchedData
     * @public
     */
    getSignatureExpiry(timeout: string, signature: string, preFetchedData?: SolanaPreFetchVerification): Promise<number>;
    /**
     * Checks whether signature is expired for good (uses "finalized" slot)
     *
     * @param signature
     * @param timeout
     * @public
     */
    isSignatureExpired(signature: string, timeout: string): Promise<boolean>;
    /**
     * Creates init transaction (InitPayIn) with a valid signature from an LP, also adds a SOL to WSOL wrapping ix to
     *  the init transaction (if indicated by the fee rate) or adds the wrapping in a separate transaction (if no
     *  indication in the fee rate)
     *
     * @param swapData swap to initialize
     * @param timeout init signature timeout
     * @param prefix init signature prefix
     * @param signature init signature
     * @param skipChecks whether to skip signature validity checks
     * @param feeRate fee rate to use for the transaction
     */
    txsInitPayIn(swapData: SolanaSwapData, timeout: string, prefix: string, signature: string, skipChecks?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * Creates init transactions (InitNotPayIn) with a valid signature from an intermediary
     *
     * @param swapData swap to initialize
     * @param timeout init signature timeout
     * @param prefix init signature prefix
     * @param signature init signature
     * @param skipChecks whether to skip signature validity checks
     * @param feeRate fee rate to use for the transaction
     */
    txsInit(swapData: SolanaSwapData, timeout: string, prefix: string, signature: string, skipChecks?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * Returns the fee rate to be used for a specific init transaction, also adding indication whether the WSOL ATA
     *  should be initialized in the init transaction and/or current balance in the WSOL ATA
     *
     * @param offerer
     * @param claimer
     * @param token
     * @param paymentHash
     */
    getInitPayInFeeRate(offerer?: PublicKey, claimer?: PublicKey, token?: PublicKey, paymentHash?: string): Promise<string>;
    /**
     * Returns the fee rate to be used for a specific init transaction
     *
     * @param offerer
     * @param claimer
     * @param token
     * @param paymentHash
     */
    getInitFeeRate(offerer?: PublicKey, claimer?: PublicKey, token?: PublicKey, paymentHash?: string): Promise<string>;
    /**
     * Get the estimated solana fee of the init transaction, this includes the required deposit for creating swap PDA
     *  and also deposit for ATAs
     */
    getInitFee(swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * Get the estimated solana fee of the init transaction, without the required deposit for creating swap PDA
     */
    getRawInitFee(swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
}
