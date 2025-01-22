"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaChainEvents = void 0;
const fs = require("fs/promises");
const SolanaChainEventsBrowser_1 = require("./SolanaChainEventsBrowser");
const BLOCKHEIGHT_FILENAME = "/blockheight.txt";
const LOG_FETCH_INTERVAL = 5 * 1000;
const LOG_FETCH_LIMIT = 500;
/**
 * Event handler for backend Node.js systems with access to fs, uses HTTP polling in combination with WS to not miss
 *  any events
 */
class SolanaChainEvents extends SolanaChainEventsBrowser_1.SolanaChainEventsBrowser {
    constructor(directory, connection, solanaSwapProgram, logFetchInterval, logFetchLimit) {
        super(connection, solanaSwapProgram);
        this.signaturesProcessing = {};
        this.directory = directory;
        this.logFetchInterval = logFetchInterval || LOG_FETCH_INTERVAL;
        this.logFetchLimit = logFetchLimit || LOG_FETCH_LIMIT;
    }
    /**
     * Retrieves last signature & slot from filesystem
     *
     * @private
     */
    getLastSignature() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const txt = (yield fs.readFile(this.directory + BLOCKHEIGHT_FILENAME)).toString();
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
        });
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
     * Parses EventObject from the transaction
     *
     * @param transaction
     * @private
     * @returns {EventObject} parsed event object
     */
    getEventObjectFromTransaction(transaction) {
        if (transaction.meta.err != null)
            return null;
        const instructions = this.solanaSwapProgram.Events.decodeInstructions(transaction.transaction.message);
        const events = this.solanaSwapProgram.Events.parseLogs(transaction.meta.logMessages);
        return {
            instructions,
            events,
            blockTime: transaction.blockTime,
            signature: transaction.transaction.signatures[0]
        };
    }
    /**
     * Fetches transaction from the RPC, parses it to even object & processes it through event handler
     *
     * @param signature
     * @private
     * @returns {boolean} whether the operation was successful
     */
    fetchTxAndProcessEvent(signature) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const transaction = yield this.connection.getParsedTransaction(signature, {
                    commitment: "confirmed",
                    maxSupportedTransactionVersion: 0
                });
                if (transaction == null)
                    return false;
                const eventObject = this.getEventObjectFromTransaction(transaction);
                if (eventObject == null)
                    return true;
                console.log("Instructions: ", eventObject.instructions);
                console.log("Events: ", eventObject.events);
                yield this.processEvent(eventObject);
                return true;
            }
            catch (e) {
                console.error(e);
                return false;
            }
        });
    }
    /**
     * Returns websocket event handler for specific event type
     *
     * @param name
     * @protected
     * @returns event handler to be passed to program's addEventListener function
     */
    getWsEventHandler(name) {
        return (data, slotNumber, signature) => {
            if (this.signaturesProcessing[signature] != null)
                return;
            console.log("[Solana Events WebSocket] Process signature: ", signature);
            this.signaturesProcessing[signature] = this.processEvent({
                events: [{ name, data: data }],
                instructions: null,
                blockTime: Math.floor(Date.now() / 1000),
                signature
            }).then(() => true).catch(e => {
                console.error(e);
                return false;
            });
        };
    }
    /**
     * Gets all the new signatures from the last processed signature
     *
     * @param lastProcessedSignature
     * @private
     */
    getNewSignatures(lastProcessedSignature) {
        return __awaiter(this, void 0, void 0, function* () {
            let signatures = [];
            let fetched = null;
            while (fetched == null || fetched.length === this.logFetchLimit) {
                if (signatures.length === 0) {
                    fetched = yield this.connection.getSignaturesForAddress(this.solanaSwapProgram.program.programId, {
                        until: lastProcessedSignature.signature,
                        limit: this.logFetchLimit
                    }, "confirmed");
                    //Check if newest returned signature (index 0) is older than the latest signature's slot, this is a sanity check
                    if (fetched.length > 0 && fetched[0].slot < lastProcessedSignature.slot) {
                        console.log("[Solana Events POLL] Sanity check triggered, returned signature slot height is older than latest!");
                        return;
                    }
                }
                else {
                    fetched = yield this.connection.getSignaturesForAddress(this.solanaSwapProgram.program.programId, {
                        before: signatures[signatures.length - 1].signature,
                        until: lastProcessedSignature.signature,
                        limit: this.logFetchLimit
                    }, "confirmed");
                }
                signatures = signatures.concat(fetched);
            }
            return signatures;
        });
    }
    /**
     * Gets single latest known signature
     *
     * @private
     */
    getFirstSignature() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.connection.getSignaturesForAddress(this.solanaSwapProgram.program.programId, {
                limit: 1
            }, "confirmed");
        });
    }
    /**
     * Processes signatures, fetches transactions & processes event through event handlers
     *
     * @param signatures
     * @private
     * @returns {Promise<{signature: string, slot: number}>} latest processed transaction signature and slot height
     */
    processSignatures(signatures) {
        return __awaiter(this, void 0, void 0, function* () {
            let lastSuccessfulSignature = null;
            try {
                for (let i = signatures.length - 1; i >= 0; i--) {
                    const txSignature = signatures[i];
                    //Check if signature is already being processed by the
                    const signaturePromise = this.signaturesProcessing[txSignature.signature];
                    if (signaturePromise != null) {
                        const result = yield signaturePromise;
                        delete this.signaturesProcessing[txSignature.signature];
                        if (result) {
                            lastSuccessfulSignature = txSignature;
                            continue;
                        }
                    }
                    console.log("[Solana Events POLL] Process signature: ", txSignature);
                    const processPromise = this.fetchTxAndProcessEvent(txSignature.signature);
                    this.signaturesProcessing[txSignature.signature] = processPromise;
                    const result = yield processPromise;
                    if (!result)
                        throw new Error("Failed to process signature: " + txSignature);
                    lastSuccessfulSignature = txSignature;
                    delete this.signaturesProcessing[txSignature.signature];
                }
            }
            catch (e) {
                console.error(e);
            }
            return lastSuccessfulSignature;
        });
    }
    /**
     * Polls for new events & processes them
     *
     * @private
     */
    checkEvents() {
        return __awaiter(this, void 0, void 0, function* () {
            const lastSignature = yield this.getLastSignature();
            let signatures = lastSignature == null ? yield this.getFirstSignature() : yield this.getNewSignatures(lastSignature);
            let lastSuccessfulSignature = yield this.processSignatures(signatures);
            if (lastSuccessfulSignature != null) {
                yield this.saveLastSignature(lastSuccessfulSignature.signature, lastSuccessfulSignature.slot);
            }
        });
    }
    setupHttpPolling() {
        return __awaiter(this, void 0, void 0, function* () {
            this.stopped = false;
            let func;
            func = () => __awaiter(this, void 0, void 0, function* () {
                yield this.checkEvents().catch(e => {
                    console.error("Failed to fetch Sol log");
                    console.error(e);
                });
                if (this.stopped)
                    return;
                this.timeout = setTimeout(func, this.logFetchInterval);
            });
            yield func();
        });
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield fs.mkdir(this.directory);
            }
            catch (e) { }
            yield this.setupHttpPolling();
            this.setupWebsocket();
        });
    }
    stop() {
        this.stopped = true;
        if (this.timeout != null)
            clearTimeout(this.timeout);
        return super.stop();
    }
}
exports.SolanaChainEvents = SolanaChainEvents;
