/// <reference types="node" />
import { Finality, SendOptions, Signer, Transaction } from "@solana/web3.js";
import { SolanaModule } from "../SolanaModule";
import { Buffer } from "buffer";
import { SolanaSigner } from "../../wallet/SolanaSigner";
export type SolanaTx = {
    tx: Transaction;
    signers: Signer[];
};
export declare class SolanaTransactions extends SolanaModule {
    private cbkBeforeTxSigned;
    /**
     * Callback for sending transaction, returns not null if it was successfully able to send the transaction, and null
     *  if the transaction should be sent through other means)
     * @private
     */
    private cbkSendTransaction;
    /**
     * Sends raw solana transaction, first through the cbkSendTransaction callback (for e.g. sending the transaction
     *  to a different specific RPC), the through the Fees handler (for e.g. Jito transaction) and last through the
     *  underlying provider's Connection instance (the usual way). Only sends the transaction through one channel.
     *
     * @param data
     * @param options
     * @private
     */
    private sendRawTransaction;
    /**
     * Waits for the transaction to confirm by periodically checking the transaction status over HTTP, also
     *  re-sends the transaction at regular intervals
     *
     * @param solanaTx solana tx to wait for confirmation for
     * @param finality wait for this finality
     * @param abortSignal signal to abort waiting for tx confirmation
     * @private
     */
    private txConfirmationAndResendWatchdog;
    /**
     * Waits for the transaction to confirm from WS, sometimes the WS rejects even though the transaction was confirmed
     *  this therefore also runs an ultimate check on the transaction in case the WS handler rejects, checking if it
     *  really was expired
     *
     * @param solanaTx solana tx to wait for confirmation for
     * @param finality wait for this finality
     * @param abortSignal signal to abort waiting for tx confirmation
     * @private
     */
    private txConfirmFromWebsocket;
    /**
     * Waits for transaction confirmation using WS subscription and occasional HTTP polling, also re-sends
     *  the transaction at regular interval
     *
     * @param solanaTx solana transaction to wait for confirmation for & keep re-sending until it confirms
     * @param abortSignal signal to abort waiting for tx confirmation
     * @param finality wait for specific finality
     * @private
     */
    private confirmTransaction;
    /**
     * Prepares solana transactions, assigns recentBlockhash if needed, applies Phantom hotfix,
     *  sets feePayer to ourselves, calls beforeTxSigned callback & signs transaction with provided signers array
     *
     * @param signer
     * @param txs
     * @private
     */
    private prepareTransactions;
    /**
     * Sends out a signed transaction to the RPC
     *
     * @param solTx solana tx to send
     * @param options send options to be passed to the RPC
     * @param onBeforePublish a callback called before every transaction is published
     * @private
     */
    private sendSignedTransaction;
    /**
     * Prepares (adds recent blockhash if required, applies Phantom hotfix),
     *  signs (all together using signAllTransactions() calls), sends (in parallel or sequentially) &
     *  optionally waits for confirmation of a batch of solana transactions
     *
     * @param signer
     * @param txs transactions to send
     * @param waitForConfirmation whether to wait for transaction confirmations (this also makes sure the transactions
     *  are re-sent at regular intervals)
     * @param abortSignal abort signal to abort waiting for transaction confirmations
     * @param parallel whether the send all the transaction at once in parallel or sequentially (such that transactions
     *  are executed in order)
     * @param onBeforePublish a callback called before every transaction is published
     */
    sendAndConfirm(signer: SolanaSigner, txs: SolanaTx[], waitForConfirmation?: boolean, abortSignal?: AbortSignal, parallel?: boolean, onBeforePublish?: (txId: string, rawTx: string) => Promise<void>): Promise<string[]>;
    /**
     * Serializes the solana transaction, saves the transaction, signers & last valid blockheight
     *
     * @param tx
     */
    serializeTx(tx: SolanaTx): Promise<string>;
    /**
     * Deserializes saved solana transaction, extracting the transaction, signers & last valid blockheight
     *
     * @param txData
     */
    deserializeTx(txData: string): Promise<SolanaTx>;
    /**
     * Gets the status of the raw solana transaction, this also checks transaction expiry & can therefore report tx
     *  in "pending" status, however pending status doesn't necessarily mean that the transaction was sent (again,
     *  no mempool on Solana, cannot check that), this function is preferred against getTxIdStatus
     *
     * @param tx
     */
    getTxStatus(tx: string): Promise<"pending" | "success" | "not_found" | "reverted">;
    /**
     * Gets the status of the solana transaction with a specific txId, this cannot report whether the transaction is
     *  "pending" because Solana has no concept of mempool & only confirmed transactions are accessible
     *
     * @param txId
     * @param finality
     */
    getTxIdStatus(txId: string, finality?: Finality): Promise<"success" | "not_found" | "reverted">;
    onBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): void;
    offBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): boolean;
    onSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): void;
    offSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): boolean;
}
