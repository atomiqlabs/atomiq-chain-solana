/// <reference types="node" />
import { Connection, PublicKey, SendOptions, Transaction } from "@solana/web3.js";
export type FeeBribeData = {
    address: string;
    endpoint: string;
    getBribeFee?: (original: bigint) => bigint;
};
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
    private blockFeeCache;
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
     * Applies fee rate to a transaction at the beginning of the transaction (has to be called after
     *  feePayer is set for the tx), specifically adds the setComputeUnitLimit & setComputeUnitPrice instruction
     *
     * @param tx
     * @param computeBudget
     * @param feeRate
     */
    applyFeeRateBegin(tx: Transaction, computeBudget: number, feeRate: string): boolean;
    /**
     * Applies fee rate to the end of the transaction (has to be called after feePayer is set for the tx),
     *  specifically adds the bribe SystemProgram.transfer instruction
     *
     * @param tx
     * @param computeBudget
     * @param feeRate
     */
    applyFeeRateEnd(tx: Transaction, computeBudget: number, feeRate: string): boolean;
    /**
     * Checks if the transaction should be submitted over Jito and if yes submits it
     *
     * @param tx
     * @param options
     * @returns {Promise<string | null>} null if the transaction was not sent over Jito, tx signature when tx was sent over Jito
     */
    submitTx(tx: Buffer, options?: SendOptions): Promise<string | null>;
}
