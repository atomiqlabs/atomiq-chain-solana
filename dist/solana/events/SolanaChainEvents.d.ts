import { Connection } from "@solana/web3.js";
import { SolanaSwapProgram } from "../swaps/SolanaSwapProgram";
import { SolanaChainEventsBrowser } from "./SolanaChainEventsBrowser";
/**
 * Event handler for backend Node.js systems with access to fs, uses HTTP polling in combination with WS to not miss
 *  any events
 */
export declare class SolanaChainEvents extends SolanaChainEventsBrowser {
    private readonly directory;
    private readonly logFetchInterval;
    private stopped;
    private timeout?;
    constructor(directory: string, connection: Connection, contractVersions: SolanaSwapProgram | {
        [version: string]: {
            swapContract: SolanaSwapProgram;
        };
    }, logFetchInterval?: number);
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
     * Polls for new events & processes them
     *
     * @private
     */
    private checkEvents;
    private setupHttpPolling;
    /**
     * @inheritDoc
     */
    init(noAutomaticPoll?: boolean): Promise<void>;
    /**
     * @inheritDoc
     */
    stop(): Promise<void>;
}
