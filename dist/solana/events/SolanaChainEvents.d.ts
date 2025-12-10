import { Connection } from "@solana/web3.js";
import { IdlEvents } from "@coral-xyz/anchor";
import { SolanaSwapProgram } from "../swaps/SolanaSwapProgram";
import { SolanaChainEventsBrowser } from "./SolanaChainEventsBrowser";
import { SwapProgram } from "../swaps/programTypes";
/**
 * Event handler for backend Node.js systems with access to fs, uses HTTP polling in combination with WS to not miss
 *  any events
 */
export declare class SolanaChainEvents extends SolanaChainEventsBrowser {
    private readonly directory;
    private readonly logFetchInterval;
    private readonly logFetchLimit;
    private signaturesProcessing;
    private processedSignatures;
    private processedSignaturesIndex;
    private stopped;
    private timeout?;
    constructor(directory: string, connection: Connection, solanaSwapProgram: SolanaSwapProgram, logFetchInterval?: number, logFetchLimit?: number);
    private addProcessedSignature;
    private isSignatureProcessed;
    /**
     * Retrieves last signature & slot from filesystem
     *
     * @private
     */
    private getLastSignature;
    /**
     * Saves last signature & slot to the filesystem
     *
     * @private
     */
    private saveLastSignature;
    /**
     * Parses EventObject from the transaction
     *
     * @param transaction
     * @private
     * @returns {EventObject} parsed event object
     */
    private getEventObjectFromTransaction;
    /**
     * Fetches transaction from the RPC, parses it to even object & processes it through event handler
     *
     * @param signature
     * @private
     * @returns {boolean} whether the operation was successful
     */
    private fetchTxAndProcessEvent;
    /**
     * Returns websocket event handler for specific event type
     *
     * @param name
     * @protected
     * @returns event handler to be passed to program's addEventListener function
     */
    protected getWsEventHandler<E extends "InitializeEvent" | "RefundEvent" | "ClaimEvent">(name: E): (data: IdlEvents<SwapProgram>[E], slotNumber: number, signature: string) => void;
    /**
     * Gets all the new signatures from the last processed signature
     *
     * @param lastProcessedSignature
     * @private
     */
    private getNewSignatures;
    /**
     * Gets single latest known signature
     *
     * @private
     */
    private getFirstSignature;
    /**
     * Processes signatures, fetches transactions & processes event through event handlers
     *
     * @param signatures
     * @private
     * @returns {Promise<{signature: string, slot: number}>} latest processed transaction signature and slot height
     */
    private processSignatures;
    /**
     * Polls for new events & processes them
     *
     * @private
     */
    private checkEvents;
    setupHttpPolling(): Promise<void>;
    init(): Promise<void>;
    stop(): Promise<void>;
}
