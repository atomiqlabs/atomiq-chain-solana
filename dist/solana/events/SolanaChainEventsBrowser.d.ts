import { ChainEvents, ClaimEvent, EventListener, InitializeEvent, RefundEvent } from "@atomiqlabs/base";
import { SolanaSwapData } from "../swaps/SolanaSwapData";
import { IdlEvents } from "@coral-xyz/anchor";
import { SolanaSwapProgram } from "../swaps/SolanaSwapProgram";
import { Connection } from "@solana/web3.js";
import { InstructionWithAccounts, ProgramEvent, SingleInstructionWithAccounts } from "../program/modules/SolanaProgramEvents";
import { SwapProgram } from "../swaps/programTypes";
export type EventObject = {
    events: ProgramEvent<SwapProgram>[];
    instructions: InstructionWithAccounts<SwapProgram>[];
    blockTime: number;
    signature: string;
};
export type InitInstruction = SingleInstructionWithAccounts<SwapProgram["instructions"][2 | 3], SwapProgram>;
/**
 * Solana on-chain event handler for front-end systems without access to fs, uses pure WS to subscribe, might lose
 *  out on some events if the network is unreliable, front-end systems should take this into consideration and not
 *  rely purely on events
 */
export declare class SolanaChainEventsBrowser implements ChainEvents<SolanaSwapData> {
    protected readonly listeners: EventListener<SolanaSwapData>[];
    protected readonly connection: Connection;
    protected readonly solanaSwapProgram: SolanaSwapProgram;
    protected eventListeners: number[];
    protected readonly logger: {
        debug: (msg: any, ...args: any[]) => false | void;
        info: (msg: any, ...args: any[]) => false | void;
        warn: (msg: any, ...args: any[]) => false | void;
        error: (msg: any, ...args: any[]) => false | void;
    };
    constructor(connection: Connection, solanaSwapContract: SolanaSwapProgram);
    /**
     * Fetches and parses transaction instructions
     *
     * @private
     * @returns {Promise<InstructionWithAccounts<SwapProgram>[]>} array of parsed instructions
     */
    private getTransactionInstructions;
    /**
     * Converts initialize instruction data into {SolanaSwapData}
     *
     * @param initIx
     * @param txoHash
     * @private
     * @returns {SolanaSwapData} converted and parsed swap data
     */
    private instructionToSwapData;
    /**
     * Returns async getter for fetching on-demand initialize event swap data
     *
     * @param eventObject
     * @param txoHash
     * @private
     * @returns {() => Promise<SolanaSwapData>} getter to be passed to InitializeEvent constructor
     */
    private getSwapDataGetter;
    protected parseInitializeEvent(data: IdlEvents<SwapProgram>["InitializeEvent"], eventObject: EventObject): InitializeEvent<SolanaSwapData>;
    protected parseRefundEvent(data: IdlEvents<SwapProgram>["RefundEvent"]): RefundEvent<SolanaSwapData>;
    protected parseClaimEvent(data: IdlEvents<SwapProgram>["ClaimEvent"]): ClaimEvent<SolanaSwapData>;
    /**
     * Processes event as received from the chain, parses it & calls event listeners
     *
     * @param eventObject
     * @protected
     */
    protected processEvent(eventObject: EventObject): Promise<void>;
    /**
     * Returns websocket event handler for specific event type
     *
     * @param name
     * @protected
     * @returns event handler to be passed to program's addEventListener function
     */
    protected getWsEventHandler<E extends "InitializeEvent" | "RefundEvent" | "ClaimEvent">(name: E): (data: IdlEvents<SwapProgram>[E], slotNumber: number, signature: string) => void;
    /**
     * Sets up event handlers listening for swap events over websocket
     *
     * @protected
     */
    protected setupWebsocket(): void;
    init(): Promise<void>;
    stop(): Promise<void>;
    registerListener(cbk: EventListener<SolanaSwapData>): void;
    unregisterListener(cbk: EventListener<SolanaSwapData>): boolean;
}
