/// <reference types="node" />
import { Connection, SendOptions } from "@solana/web3.js";
import { SolanaFees } from "./modules/SolanaFees";
import { SolanaBlocks } from "./modules/SolanaBlocks";
import { SolanaSlots } from "./modules/SolanaSlots";
import { SolanaTokens } from "./modules/SolanaTokens";
import { SolanaTransactions, SolanaTx } from "./modules/SolanaTransactions";
import { SolanaSignatures } from "./modules/SolanaSignatures";
import { SolanaEvents } from "./modules/SolanaEvents";
import { ChainInterface, TransactionConfirmationOptions } from "@atomiqlabs/base";
import { SolanaSigner } from "../wallet/SolanaSigner";
import { Buffer } from "buffer";
export type SolanaRetryPolicy = {
    maxRetries?: number;
    delay?: number;
    exponential?: boolean;
    transactionResendInterval?: number;
};
export declare class SolanaChainInterface implements ChainInterface<SolanaTx, SolanaSigner, "SOLANA"> {
    readonly chainId = "SOLANA";
    readonly SLOT_TIME = 400;
    readonly TX_SLOT_VALIDITY = 151;
    readonly connection: Connection;
    readonly retryPolicy: SolanaRetryPolicy;
    readonly Blocks: SolanaBlocks;
    Fees: SolanaFees;
    readonly Slots: SolanaSlots;
    readonly Tokens: SolanaTokens;
    readonly Transactions: SolanaTransactions;
    readonly Signatures: SolanaSignatures;
    readonly Events: SolanaEvents;
    protected readonly logger: {
        debug: (msg: any, ...args: any[]) => void;
        info: (msg: any, ...args: any[]) => void;
        warn: (msg: any, ...args: any[]) => void;
        error: (msg: any, ...args: any[]) => void;
    };
    constructor(connection: Connection, retryPolicy?: SolanaRetryPolicy, solanaFeeEstimator?: SolanaFees);
    getBalance(signer: string, tokenAddress: string): Promise<bigint>;
    isValidAddress(address: string): boolean;
    getNativeCurrencyAddress(): string;
    txsTransfer(signer: string, token: string, amount: bigint, dstAddress: string, feeRate?: string): Promise<SolanaTx[]>;
    transfer(signer: SolanaSigner, token: string, amount: bigint, dstAddress: string, txOptions?: TransactionConfirmationOptions): Promise<string>;
    sendAndConfirm(signer: SolanaSigner, txs: SolanaTx[], waitForConfirmation?: boolean, abortSignal?: AbortSignal, parallel?: boolean, onBeforePublish?: (txId: string, rawTx: string) => Promise<void>): Promise<string[]>;
    serializeTx(tx: SolanaTx): Promise<string>;
    deserializeTx(txData: string): Promise<SolanaTx>;
    getTxIdStatus(txId: string): Promise<"not_found" | "pending" | "success" | "reverted">;
    getTxStatus(tx: string): Promise<"not_found" | "pending" | "success" | "reverted">;
    offBeforeTxReplace(callback: (oldTx: string, oldTxId: string, newTx: string, newTxId: string) => Promise<void>): boolean;
    onBeforeTxReplace(callback: (oldTx: string, oldTxId: string, newTx: string, newTxId: string) => Promise<void>): void;
    onBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): void;
    offBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): boolean;
    onSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): void;
    offSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): boolean;
    isValidToken(tokenIdentifier: string): boolean;
    randomAddress(): string;
    randomSigner(): SolanaSigner;
}
