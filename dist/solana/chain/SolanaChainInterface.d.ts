/// <reference types="node" />
/// <reference types="node" />
import { Connection, SendOptions, Transaction } from "@solana/web3.js";
import { SolanaFees } from "./modules/SolanaFees";
import { SolanaBlocks } from "./modules/SolanaBlocks";
import { SolanaSlots } from "./modules/SolanaSlots";
import { SolanaTokens } from "./modules/SolanaTokens";
import { SignedSolanaTx, SolanaTransactions, SolanaTx } from "./modules/SolanaTransactions";
import { SolanaSignatures } from "./modules/SolanaSignatures";
import { SolanaEvents } from "./modules/SolanaEvents";
import { ChainInterface, TransactionConfirmationOptions } from "@atomiqlabs/base";
import { SolanaSigner } from "../wallet/SolanaSigner";
import { Buffer } from "buffer";
import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
/**
 * Retry policy configuration for Solana RPC calls
 * @category Chain Interface
 */
export type SolanaRetryPolicy = {
    /**
     * Maximum retries to be attempted
     */
    maxRetries?: number;
    /**
     * Default delay between retries
     */
    delay?: number;
    /**
     * Whether the delays should scale exponentially, i.e. 1 second, 2 seconds, 4 seconds, 8 seconds
     */
    exponential?: boolean;
    /**
     * Interval between re-sending Solana transaction to the RPC
     */
    transactionResendInterval?: number;
};
/**
 * Main chain interface for interacting with Solana blockchain
 * @category Chain Interface
 */
export declare class SolanaChainInterface implements ChainInterface<SolanaTx, SignedSolanaTx, SolanaSigner, "SOLANA", Wallet> {
    /**
     * @inheritDoc
     */
    readonly chainId = "SOLANA";
    /**
     * Average Solana slot time in milliseconds.
     */
    readonly SLOT_TIME = 400;
    /**
     * Approximate number of recent slots for which a transaction remains valid.
     */
    readonly TX_SLOT_VALIDITY = 151;
    /**
     * Underlying Solana web3.js connection.
     */
    readonly connection: Connection;
    /**
     * Retry policy used by chain modules.
     */
    readonly retryPolicy?: SolanaRetryPolicy;
    /**
     * Block-related read module.
     */
    readonly Blocks: SolanaBlocks;
    /**
     * Fee estimation and fee-rate module.
     */
    Fees: SolanaFees;
    /**
     * Slot-related read module.
     */
    readonly Slots: SolanaSlots;
    /**
     * Token operations module.
     */
    readonly Tokens: SolanaTokens;
    /**
     * Transaction send/confirm/serialization module.
     */
    readonly Transactions: SolanaTransactions;
    /**
     * Signature utilities module.
     */
    readonly Signatures: SolanaSignatures;
    /**
     * Event/log scanning module.
     */
    readonly Events: SolanaEvents;
    protected readonly logger: {
        debug: (msg: string, ...args: any[]) => false | void;
        info: (msg: string, ...args: any[]) => false | void;
        warn: (msg: string, ...args: any[]) => false | void;
        error: (msg: string, ...args: any[]) => false | void;
    };
    constructor(connection: Connection, retryPolicy?: SolanaRetryPolicy, solanaFeeEstimator?: SolanaFees);
    /**
     * @inheritDoc
     */
    getBalance(signer: string, tokenAddress: string): Promise<bigint>;
    /**
     * @inheritDoc
     */
    isValidAddress(address: string): boolean;
    /**
     * @inheritDoc
     */
    normalizeAddress(address: string): string;
    /**
     * @inheritDoc
     */
    getNativeCurrencyAddress(): string;
    /**
     * @inheritDoc
     */
    txsTransfer(signer: string, token: string, amount: bigint, dstAddress: string, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * @inheritDoc
     */
    transfer(signer: SolanaSigner, token: string, amount: bigint, dstAddress: string, txOptions?: TransactionConfirmationOptions): Promise<string>;
    /**
     * @inheritDoc
     */
    sendAndConfirm(signer: SolanaSigner, txs: SolanaTx[], waitForConfirmation?: boolean, abortSignal?: AbortSignal, parallel?: boolean, onBeforePublish?: (txId: string, rawTx: string) => Promise<void>): Promise<string[]>;
    /**
     * @inheritDoc
     */
    sendSignedAndConfirm(txs: SignedSolanaTx[], waitForConfirmation?: boolean, abortSignal?: AbortSignal, parallel?: boolean, onBeforePublish?: (txId: string, rawTx: string) => Promise<void>): Promise<string[]>;
    /**
     * @inheritDoc
     */
    serializeTx(tx: SolanaTx): Promise<string>;
    /**
     * @inheritDoc
     */
    deserializeTx(txData: string): Promise<SolanaTx>;
    /**
     * @inheritDoc
     */
    serializeSignedTx(tx: Transaction): Promise<string>;
    /**
     * @inheritDoc
     */
    deserializeSignedTx(txData: string): Promise<Transaction>;
    /**
     * @inheritDoc
     */
    getTxIdStatus(txId: string): Promise<"not_found" | "pending" | "success" | "reverted">;
    /**
     * @inheritDoc
     */
    getTxStatus(tx: string): Promise<"not_found" | "pending" | "success" | "reverted">;
    /**
     * @inheritDoc
     */
    getFinalizedBlock(): Promise<{
        height: number;
        blockHash: string;
    }>;
    /**
     * @inheritDoc
     */
    offBeforeTxReplace(callback: (oldTx: string, oldTxId: string, newTx: string, newTxId: string) => Promise<void>): boolean;
    /**
     * @inheritDoc
     */
    onBeforeTxReplace(callback: (oldTx: string, oldTxId: string, newTx: string, newTxId: string) => Promise<void>): void;
    /**
     * @inheritDoc
     */
    onBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): void;
    /**
     * @inheritDoc
     */
    offBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): boolean;
    /**
     * Registers a low-level transaction sender override hook.
     *
     * @param callback Callback used for raw transaction publishing
     */
    onSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): void;
    /**
     * Unregisters a previously registered transaction sender override hook.
     *
     * @param callback Previously registered callback
     */
    offSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): boolean;
    /**
     * @inheritDoc
     */
    isValidToken(tokenIdentifier: string): boolean;
    /**
     * @inheritDoc
     */
    randomAddress(): string;
    /**
     * @inheritDoc
     */
    randomSigner(): SolanaSigner;
    /**
     * @inheritDoc
     */
    wrapSigner(signer: Wallet): Promise<SolanaSigner>;
}
