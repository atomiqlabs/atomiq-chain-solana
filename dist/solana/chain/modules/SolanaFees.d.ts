/// <reference types="node" />
/// <reference types="node" />
import { Connection, PublicKey, SendOptions, Transaction } from "@solana/web3.js";
/**
 * Bribe configuration used for Jito-like tips that handled outside of native Solana network fees
 *
 * @category Chain Interface
 */
export type FeeBribeData = {
    /**
     * Address to send the bribe to (e.g. Jito tip)
     */
    address: string;
    /**
     * HTTP endpoint to send the transaction to instead of the RPC, e.g. a Jito endpoint
     */
    endpoint: string;
    /**
     * An optional function for overriding the bribe to be sent to the specified address for the tx
     */
    getBribeFee?: (original: bigint) => bigint;
};
/**
 * Fee estimation service for the Solana network. Uses client-side fee estimation algorithm by default, which
 *  fetches a bunch (default 8) random blocks in the past period (default 150) and computes the average fee. It
 *  automatically detects whether the underlying RPC endpoint is a Helius one which features the `getPriorityFeeEstimate`
 *  endpoint, and if available uses that one.
 *
 * @category Chain Interface
 */
export declare class SolanaFees {
    private readonly connection;
    private readonly maxFeeMicroLamports;
    private readonly numSamples;
    private readonly period;
    private useHeliusApi;
    private heliusApiSupported;
    private readonly heliusFeeLevel;
    private readonly bribeData?;
    private readonly getStaticFee?;
    private readonly logger;
    private blockFeeCache?;
    /**
     * @param connection Underlying Solana network connection to use for read access to Solana
     * @param maxFeeMicroLamports Maximum allowed fee in microLamports/CU (1/1,000,000 of a lamport per compute unit)
     * @param numSamples Number of samples to use when estimating the global fee on the client-side, this many blocks are
     *  sampled from the last `period` blocks to estimate an average fee rate
     * @param period Period of past blocks to sample random blocks from when estimating the global fee on the client-side
     * @param useHeliusApi Whether to use the helius API or not, default to `"auto"`, which automatically detects if the
     *  underlying RPC supports Helius's `getPriorityFeeEstimate` RPC call
     * @param heliusFeeLevel Fee level to use when fetching the fee rate from Helius's `getPriorityFeeEstimate` RPC endpoint,
     *  for the meaning of the different levels refer to https://www.helius.dev/docs/priority-fee-api#priority-levels-explained
     * @param getStaticFee Optional function for adding a base fee to transactions (this function returns the base fee
     *  in lamports to be added to the transaction) - this fee doesn't scale with CUs of the transaction and is instead
     *  applied as-is
     * @param bribeData Bribe fee configuration (used for e.g. Jito tips)
     */
    constructor(connection: Connection, maxFeeMicroLamports?: number, numSamples?: number, period?: number, useHeliusApi?: "yes" | "no" | "auto", heliusFeeLevel?: "min" | "low" | "medium" | "high" | "veryHigh" | "unsafeMax", getStaticFee?: (feeRate: bigint) => bigint, bribeData?: FeeBribeData);
    /**
     * Returns solana block with transactionDetails="signatures"
     *
     * @param slot
     * @private
     */
    private getBlockWithSignature;
    /**
     * Returns fee estimate from Helius API - only works with Helius RPC, return null for all other RPC providers
     *
     * @param mutableAccounts
     * @private
     */
    private getPriorityFeeEstimate;
    /**
     * Sends the transaction over Jito
     *
     * @param tx
     * @param options
     * @private
     * @returns {Promise<string>} transaction signature
     */
    private sendJitoTx;
    /**
     * Checks whether the transaction should be sent over Jito, returns the fee paid to Jito in case the transaction
     *  should be sent over Jito, returns null if the transaction shouldn't be sent over Jito
     *
     * @param parsedTx
     * @private
     */
    private getJitoTxFee;
    /**
     * Gets the mean microLamports/CU fee rate for the block at a specific slot
     *
     * @param slot
     * @private
     */
    private getBlockMeanFeeRate;
    /**
     * Manually gets global fee rate by sampling random blocks over the last period
     *
     * @private
     * @returns {Promise<BN>} sampled mean microLamports/CU fee over the last period
     */
    private _getGlobalFeeRate;
    /**
     * Gets the combined microLamports/CU fee rate (from localized & global fee market)
     *
     * @param mutableAccounts
     * @private
     */
    private _getFeeRate;
    /**
     * Gets global fee rate, with caching
     *
     * @returns {Promise<BN>} global fee rate microLamports/CU
     */
    getGlobalFeeRate(): Promise<bigint>;
    /**
     * Gets the combined microLamports/CU fee rate (from localized & global fee market), cached & adjusted as for
     *  when bribe and/or static fee should be included, format: <uLamports/CU>;<static fee lamport>[;<bribe address>]
     *
     * @param mutableAccounts
     * @private
     */
    getFeeRate(mutableAccounts: PublicKey[]): Promise<string>;
    /**
     * Calculates the total priority fee paid for a given compute budget at a given fee rate
     *
     * @param computeUnits
     * @param feeRate
     * @param includeStaticFee whether the include the static/base part of the fee rate
     */
    getPriorityFee(computeUnits: number, feeRate: string, includeStaticFee?: boolean): bigint;
    /**
     * Applies fee rate to a transaction, should be called before adding instructions to the transaction, specifically
     *  it adds the setComputeUnitLimit & setComputeUnitPrice instruction.
     *
     * @example
     * ```typescript
     * const feeRate = solanaFees.getFeeRate([...writeableAccounts]);
     * const tx = new Transaction();
     * //Apply the fee rate part at the beginning of the transaction (specifically setComputeUnitLimit & setComputeUnitPrice)
     * SolanaFees.applyFeeRateBegin(tx, feeRate);
     * //Add instructions here
     * tx.add(instruction1);
     * tx.add(instruction2);
     * //Set the fee payer
     * tx.feePayer = feePayerPublicKey;
     * //Apply the fee rate part at the end of the transaction (specifically the transfer to the bribe account, e.g. Jito tip)
     * SolanaFees.applyFeeRateEnd(tx, feeRate);
     * ```
     *
     * @param tx
     * @param computeBudget
     * @param feeRate
     */
    static applyFeeRateBegin(tx: Transaction, computeBudget: number | null, feeRate: string): void;
    /**
     * Applies fee rate to a transaction, should be called after adding instructions to the transaction, specifically
     *  it adds the adds the bribe SystemProgram.transfer instruction.
     *
     * @example
     * ```typescript
     * const feeRate = solanaFees.getFeeRate([...writeableAccounts]);
     * const tx = new Transaction();
     * //Apply the fee rate part at the beginning of the transaction (specifically setComputeUnitLimit & setComputeUnitPrice)
     * SolanaFees.applyFeeRateBegin(tx, feeRate);
     * //Add instructions here
     * tx.add(instruction1);
     * tx.add(instruction2);
     * //Set the fee payer
     * tx.feePayer = feePayerPublicKey;
     * //Apply the fee rate part at the end of the transaction (specifically the transfer to the bribe account, e.g. Jito tip)
     * SolanaFees.applyFeeRateEnd(tx, feeRate);
     * ```
     *
     * @param tx
     * @param computeBudget
     * @param feeRate
     */
    static applyFeeRateEnd(tx: Transaction, computeBudget: number | null, feeRate: string): void;
    /**
     * Checks if the transaction should be submitted over Jito and if yes submits it
     *
     * @param tx Raw signed transaction to be attempted to be sent over Jito
     * @param options Send options for the sendTransaction RPC call
     * @returns {Promise<string | null>} null if the transaction was not sent over Jito, tx signature when tx was sent over Jito
     */
    submitTx(tx: Buffer, options?: SendOptions): Promise<string | null>;
}
