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
    maxRetries?: number;
    delay?: number;
    exponential?: boolean;
    transactionResendInterval?: number;
};
/**
 * Main chain interface for interacting with Solana blockchain
 * @category Chain Interface
 */
export declare class SolanaChainInterface implements ChainInterface<SolanaTx, SignedSolanaTx, SolanaSigner, "SOLANA", Wallet> {
    readonly chainId = "SOLANA";
    readonly SLOT_TIME = 400;
    readonly TX_SLOT_VALIDITY = 151;
    readonly connection: Connection;
    readonly retryPolicy?: SolanaRetryPolicy;
    readonly Blocks: SolanaBlocks;
    Fees: SolanaFees;
    readonly Slots: SolanaSlots;
    readonly Tokens: SolanaTokens;
    readonly Transactions: SolanaTransactions;
    readonly Signatures: SolanaSignatures;
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
    onSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): void;
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
