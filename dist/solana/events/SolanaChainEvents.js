"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaChainEvents = void 0;
const fs = require("fs/promises");
const SolanaChainEventsBrowser_1 = require("./SolanaChainEventsBrowser");
const BLOCKHEIGHT_FILENAME = "/blockheight.txt";
const LOG_FETCH_INTERVAL = 5 * 1000;
/**
 * Event handler for backend Node.js systems with access to fs, uses HTTP polling in combination with WS to not miss
 *  any events
 */
class SolanaChainEvents extends SolanaChainEventsBrowser_1.SolanaChainEventsBrowser {
    constructor(directory, connection, solanaSwapProgram, logFetchInterval) {
        super(connection, solanaSwapProgram);
        this.stopped = true;
        this.directory = directory;
        this.logFetchInterval = logFetchInterval || LOG_FETCH_INTERVAL;
    }
    /**
     * Retrieves last signature & slot from filesystem
     *
     * @private
     */
    async getLastSignature() {
        try {
            const txt = (await fs.readFile(this.directory + BLOCKHEIGHT_FILENAME)).toString();
            const arr = txt.split(";");
            if (arr.length < 2)
                return {
                    signature: txt,
                    slot: 0
                };
            return {
                signature: arr[0],
                slot: parseInt(arr[1])
            };
        }
        catch (e) {
            return null;
        }
    }
    /**
     * Saves last signature & slot to the filesystem
     *
     * @private
     */
    saveLastSignature(lastSignature, slot) {
        return fs.writeFile(this.directory + BLOCKHEIGHT_FILENAME, lastSignature + ";" + slot);
    }
    /**
     * Polls for new events & processes them
     *
     * @private
     */
    async checkEvents() {
        const lastSignature = await this.getLastSignature();
        const result = await this.poll(lastSignature ?? undefined);
        if (result != null) {
            await this.saveLastSignature(result.signature, result.slot);
        }
    }
    async setupHttpPolling() {
        this.stopped = false;
        let func;
        func = async () => {
            await this.checkEvents().catch(e => {
                this.logger.error("setupHttpPolling(): Failed to fetch Solana log: ", e);
            });
            if (this.stopped)
                return;
            this.timeout = setTimeout(func, this.logFetchInterval);
        };
        await func();
    }
    async init(noAutomaticPoll) {
        if (noAutomaticPoll)
            return;
        try {
            await fs.mkdir(this.directory);
        }
        catch (e) { }
        await this.setupHttpPolling();
        this.setupWebsocket();
    }
    stop() {
        this.stopped = true;
        if (this.timeout != null)
            clearTimeout(this.timeout);
        return super.stop();
    }
}
exports.SolanaChainEvents = SolanaChainEvents;
