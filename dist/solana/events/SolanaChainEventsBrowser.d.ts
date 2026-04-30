import { ChainEvents, ClaimEvent, EventListener, InitializeEvent, RefundEvent } from "@atomiqlabs/base";
import { SolanaSwapData } from "../swaps/SolanaSwapData";
import { IdlEvents } from "@coral-xyz/anchor";
import { SolanaSwapProgram } from "../swaps/SolanaSwapProgram";
import { Connection } from "@solana/web3.js";
import { InstructionWithAccounts, ProgramEvent } from "../program/modules/SolanaProgramEvents";
import { SwapProgram } from "../swaps/v1/programTypes";
/**
 * Parsed event payload grouped by originating transaction metadata.
 *
 * @category Events
 */
export type EventObject = {
    events: ProgramEvent<SwapProgram>[];
    instructions?: (InstructionWithAccounts<SwapProgram> | null)[];
    blockTime: number;
    signature: string;
};
/**
 * Legacy current cursor of Solana event listener state.
 *
 * @category Events
 */
export type SolanaLegacyEventListenerState = {
    /**
     * Last processed transaction's signature
     */
    signature: string;
    /**
     * Last processed transaction's slot
     */
    slot: number;
};
/**
 * Current cursor of Solana event listener state.
 *
 * @category Events
 */
export type SolanaEventListenerState = {
    [version: string]: SolanaLegacyEventListenerState | null;
};
/**
 * Solana on-chain event handler for front-end systems without access to fs, uses pure WS to subscribe, might lose
 *  out on some events if the network is unreliable, front-end systems should take this into consideration and not
 *  rely purely on events
 *
 * @category Events
 */
export declare class SolanaChainEventsBrowser implements ChainEvents<SolanaSwapData, SolanaLegacyEventListenerState | SolanaEventListenerState> {
    /**
     * @internal
     */
    protected readonly listeners: EventListener<SolanaSwapData>[];
    /**
     * @internal
     */
    protected readonly connection: Connection;
    /**
     * @internal
     */
    protected readonly contractVersions: {
        [version: string]: {
            swapContract: SolanaSwapProgram;
        };
    };
    /**
     * @internal
     */
    protected eventListeners: {
        [version: string]: number[];
    };
    /**
     * @internal
     */
    protected readonly logger: {
        debug: (msg: string, ...args: any[]) => false | void;
        info: (msg: string, ...args: any[]) => false | void;
        warn: (msg: string, ...args: any[]) => false | void;
        error: (msg: string, ...args: any[]) => false | void;
    };
    private readonly logFetchLimit;
    private signaturesProcessing;
    private processedSignatures;
    private processedSignaturesIndex;
    constructor(connection: Connection, contractVersions: SolanaSwapProgram | {
        [version: string]: {
            swapContract: SolanaSwapProgram;
        };
    }, logFetchLimit?: number);
    private addProcessedSignature;
    private isSignatureProcessed;
    /**
     * Parses EventObject from the transaction
     *
     * @param transaction
     * @param version
     * @private
     * @returns {EventObject} parsed event object
     */
    private getEventObjectFromTransaction;
    /**
     * Fetches transaction from the RPC, parses it to even object & processes it through event handler
     *
     * @param signature
     * @param version
     * @private
     * @returns {boolean} whether the operation was successful
     */
    private fetchTxAndProcessEvent;
    /**
     * Fetches and parses transaction instructions
     *
     * @private
     * @returns {Promise<(InstructionWithAccounts<SwapProgram> | null)[] | null>} array of parsed instructions
     */
    private getTransactionInstructions;
    /**
     * Returns async getter for fetching on-demand initialize event swap data
     *
     * @param eventObject
     * @param txoHash
     * @param version
     * @private
     * @returns {() => Promise<SolanaSwapData>} getter to be passed to InitializeEvent constructor
     */
    private getSwapDataGetter;
    /**
     * @internal
     */
    protected parseInitializeEvent(data: IdlEvents<SwapProgram>["InitializeEvent"], eventObject: EventObject, version: string): InitializeEvent<SolanaSwapData>;
    /**
     * @internal
     */
    protected parseRefundEvent(data: IdlEvents<SwapProgram>["RefundEvent"], version: string): RefundEvent<SolanaSwapData>;
    /**
     * @internal
     */
    protected parseClaimEvent(data: IdlEvents<SwapProgram>["ClaimEvent"], version: string): ClaimEvent<SolanaSwapData>;
    /**
     * Processes event as received from the chain, parses it & calls event listeners
     *
     * @param eventObject
     * @param version
     * @internal
     */
    protected processEvent(eventObject: EventObject, version: string): Promise<void>;
    /**
     * Returns websocket event handler for specific event type
     *
     * @param name
     * @param version
     * @internal
     * @returns event handler to be passed to program's addEventListener function
     */
    protected getWsEventHandler<E extends "InitializeEvent" | "RefundEvent" | "ClaimEvent">(name: E, version: string): (data: IdlEvents<SwapProgram>[E], slotNumber: number, signature: string) => void;
    /**
     * Sets up event handlers listening for swap events over websocket
     *
     * @internal
     */
    protected setupWebsocket(): void;
    /**
     * Gets all the new signatures from the last processed signature
     *
     * @param lastProcessedSignature
     * @param version
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
     * @param version
     * @private
     * @returns {Promise<{signature: string, slot: number}>} latest processed transaction signature and slot height
     */
    private processSignatures;
    /**
     * @inheritDoc
     */
    poll(lastSignature?: SolanaLegacyEventListenerState | SolanaEventListenerState): Promise<SolanaEventListenerState>;
    /**
     * @inheritDoc
     */
    init(noAutomaticPoll?: boolean): Promise<void>;
    /**
     * @inheritDoc
     */
    stop(): Promise<void>;
    /**
     * @inheritDoc
     */
    registerListener(cbk: EventListener<SolanaSwapData>): void;
    /**
     * @inheritDoc
     */
    unregisterListener(cbk: EventListener<SolanaSwapData>): boolean;
}
