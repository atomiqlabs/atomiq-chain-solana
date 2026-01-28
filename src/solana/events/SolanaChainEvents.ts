import {Connection} from "@solana/web3.js";
import * as fs from "fs/promises";
import {SolanaSwapProgram} from "../swaps/SolanaSwapProgram";
import {SolanaChainEventsBrowser} from "./SolanaChainEventsBrowser";

const BLOCKHEIGHT_FILENAME = "/blockheight.txt";
const LOG_FETCH_INTERVAL = 5*1000;

/**
 * Event handler for backend Node.js systems with access to fs, uses HTTP polling in combination with WS to not miss
 *  any events
 */
export class SolanaChainEvents extends SolanaChainEventsBrowser {

    private readonly directory: string;
    private readonly logFetchInterval: number;

    private stopped: boolean = true;
    private timeout?: NodeJS.Timeout;

    constructor(
        directory: string,
        connection: Connection,
        solanaSwapProgram: SolanaSwapProgram,
        logFetchInterval?: number
    ) {
        super(connection, solanaSwapProgram)
        this.directory = directory;
        this.logFetchInterval = logFetchInterval || LOG_FETCH_INTERVAL;
    }

    /**
     * Retrieves last signature & slot from filesystem
     *
     * @private
     */
    private async getLastSignature(): Promise<{
        signature: string,
        slot: number
    } | null> {
        try {
            const txt = (await fs.readFile(this.directory+BLOCKHEIGHT_FILENAME)).toString();
            const arr = txt.split(";");
            if(arr.length<2) return {
                signature: txt,
                slot: 0
            };
            return {
                signature: arr[0],
                slot: parseInt(arr[1])
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Saves last signature & slot to the filesystem
     *
     * @private
     */
    private saveLastSignature(lastSignature: string, slot: number): Promise<void> {
        return fs.writeFile(this.directory+BLOCKHEIGHT_FILENAME, lastSignature+";"+slot);
    }

    /**
     * Polls for new events & processes them
     *
     * @private
     */
    private async checkEvents() {
        const lastSignature = await this.getLastSignature();

        const result = await this.poll(lastSignature ?? undefined);

        if(result!=null) {
            await this.saveLastSignature(result.signature, result.slot);
        }
    }

    async setupHttpPolling() {
        this.stopped = false;
        let func: () => Promise<void>;
        func = async () => {
            await this.checkEvents().catch(e => {
                this.logger.error("setupHttpPolling(): Failed to fetch Solana log: ", e);
            });
            if(this.stopped) return;
            this.timeout = setTimeout(func, this.logFetchInterval);
        };
        await func();
    }

    async init(noAutomaticPoll?: boolean): Promise<void> {
        if(noAutomaticPoll) return;
        try {
            await fs.mkdir(this.directory);
        } catch (e) {}

        await this.setupHttpPolling();
        this.setupWebsocket();
    }

    stop(): Promise<void> {
        this.stopped = true;
        if(this.timeout!=null) clearTimeout(this.timeout)
        return super.stop();
    }

}
