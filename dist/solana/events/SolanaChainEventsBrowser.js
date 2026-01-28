"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaChainEventsBrowser = void 0;
const base_1 = require("@atomiqlabs/base");
const SolanaSwapData_1 = require("../swaps/SolanaSwapData");
const Utils_1 = require("../../utils/Utils");
const SwapTypeEnum_1 = require("../swaps/SwapTypeEnum");
const buffer_1 = require("buffer");
const LOG_FETCH_LIMIT = 500;
const PROCESSED_SIGNATURES_BACKLOG = 100;
/**
 * Solana on-chain event handler for front-end systems without access to fs, uses pure WS to subscribe, might lose
 *  out on some events if the network is unreliable, front-end systems should take this into consideration and not
 *  rely purely on events
 */
class SolanaChainEventsBrowser {
    constructor(connection, solanaSwapContract, logFetchLimit) {
        this.listeners = [];
        this.eventListeners = [];
        this.logger = (0, Utils_1.getLogger)("SolanaChainEventsBrowser: ");
        this.signaturesProcessing = {};
        this.processedSignatures = [];
        this.processedSignaturesIndex = 0;
        this.connection = connection;
        this.solanaSwapProgram = solanaSwapContract;
        this.logFetchLimit = logFetchLimit ?? LOG_FETCH_LIMIT;
    }
    addProcessedSignature(signature) {
        this.processedSignatures[this.processedSignaturesIndex] = signature;
        this.processedSignaturesIndex += 1;
        if (this.processedSignaturesIndex >= PROCESSED_SIGNATURES_BACKLOG)
            this.processedSignaturesIndex = 0;
    }
    isSignatureProcessed(signature) {
        return this.processedSignatures.includes(signature);
    }
    /**
     * Parses EventObject from the transaction
     *
     * @param transaction
     * @private
     * @returns {EventObject} parsed event object
     */
    getEventObjectFromTransaction(transaction) {
        const signature = transaction.transaction.signatures[0];
        if (transaction.meta == null)
            throw new Error(`Transaction 'meta' not found for Solana tx: ${signature}`);
        if (transaction.meta.err != null || transaction.meta.logMessages == null)
            return null;
        const instructions = this.solanaSwapProgram.Events.decodeInstructions(transaction.transaction.message);
        const events = this.solanaSwapProgram.Events.parseLogs(transaction.meta.logMessages);
        return {
            instructions,
            events,
            blockTime: transaction.blockTime,
            signature: signature
        };
    }
    /**
     * Fetches transaction from the RPC, parses it to even object & processes it through event handler
     *
     * @param signature
     * @private
     * @returns {boolean} whether the operation was successful
     */
    async fetchTxAndProcessEvent(signature) {
        try {
            const transaction = await this.connection.getParsedTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 1
            });
            if (transaction == null)
                return false;
            const eventObject = this.getEventObjectFromTransaction(transaction);
            if (eventObject == null)
                return true;
            await this.processEvent(eventObject);
            return true;
        }
        catch (e) {
            this.logger.error("fetchTxAndProcessEvent(): Error fetching transaction and processing event, signature: " + signature, e);
            return false;
        }
    }
    /**
     * Fetches and parses transaction instructions
     *
     * @private
     * @returns {Promise<(InstructionWithAccounts<SwapProgram> | null)[] | null>} array of parsed instructions
     */
    async getTransactionInstructions(signature) {
        const transaction = await (0, Utils_1.tryWithRetries)(async () => {
            const res = await this.connection.getParsedTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0
            });
            if (res == null)
                throw new Error("Transaction not found!");
            return res;
        });
        if (transaction.meta == null)
            throw new Error("Transaction 'meta' not found!");
        if (transaction.meta.err != null)
            return null;
        return this.solanaSwapProgram.Events.decodeInstructions(transaction.transaction.message);
    }
    /**
     * Returns async getter for fetching on-demand initialize event swap data
     *
     * @param eventObject
     * @param txoHash
     * @private
     * @returns {() => Promise<SolanaSwapData>} getter to be passed to InitializeEvent constructor
     */
    getSwapDataGetter(eventObject, txoHash) {
        return async () => {
            if (eventObject.instructions == null) {
                const ixs = await this.getTransactionInstructions(eventObject.signature);
                if (ixs == null)
                    return null;
                eventObject.instructions = ixs;
            }
            const initIx = eventObject.instructions.find(ix => ix != null && (ix.name === "offererInitializePayIn" || ix.name === "offererInitialize"));
            if (initIx == null)
                return null;
            return SolanaSwapData_1.SolanaSwapData.fromInstruction(initIx, txoHash);
        };
    }
    parseInitializeEvent(data, eventObject) {
        const paymentHash = buffer_1.Buffer.from(data.hash).toString("hex");
        const txoHash = buffer_1.Buffer.from(data.txoHash).toString("hex");
        const escrowHash = (0, Utils_1.toEscrowHash)(paymentHash, data.sequence);
        this.logger.debug("InitializeEvent paymentHash: " + paymentHash + " sequence: " + data.sequence.toString(10) +
            " txoHash: " + txoHash + " escrowHash: " + escrowHash);
        return new base_1.InitializeEvent(escrowHash, SwapTypeEnum_1.SwapTypeEnum.toChainSwapType(data.kind), (0, Utils_1.onceAsync)(this.getSwapDataGetter(eventObject, txoHash)));
    }
    parseRefundEvent(data) {
        const paymentHash = buffer_1.Buffer.from(data.hash).toString("hex");
        const escrowHash = (0, Utils_1.toEscrowHash)(paymentHash, data.sequence);
        this.logger.debug("RefundEvent paymentHash: " + paymentHash + " sequence: " + data.sequence.toString(10) +
            " escrowHash: " + escrowHash);
        return new base_1.RefundEvent(escrowHash);
    }
    parseClaimEvent(data) {
        const secret = buffer_1.Buffer.from(data.secret).toString("hex");
        const paymentHash = buffer_1.Buffer.from(data.hash).toString("hex");
        const escrowHash = (0, Utils_1.toEscrowHash)(paymentHash, data.sequence);
        this.logger.debug("ClaimEvent paymentHash: " + paymentHash + " sequence: " + data.sequence.toString(10) +
            " secret: " + secret + " escrowHash: " + escrowHash);
        return new base_1.ClaimEvent(escrowHash, secret);
    }
    /**
     * Processes event as received from the chain, parses it & calls event listeners
     *
     * @param eventObject
     * @protected
     */
    async processEvent(eventObject) {
        let parsedEvents = eventObject.events.map(event => {
            let parsedEvent;
            switch (event.name) {
                case "ClaimEvent":
                    parsedEvent = this.parseClaimEvent(event.data);
                    break;
                case "RefundEvent":
                    parsedEvent = this.parseRefundEvent(event.data);
                    break;
                case "InitializeEvent":
                    parsedEvent = this.parseInitializeEvent(event.data, eventObject);
                    break;
            }
            parsedEvent.meta = {
                blockTime: eventObject.blockTime,
                timestamp: eventObject.blockTime,
                txId: eventObject.signature
            };
            return parsedEvent;
        }).filter(parsedEvent => parsedEvent != null);
        for (let listener of this.listeners) {
            await listener(parsedEvents);
        }
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
            if (this.isSignatureProcessed(signature))
                return;
            this.logger.debug("getWsEventHandler(" + name + "): Process signature: ", signature);
            this.signaturesProcessing[signature] = this.processEvent({
                events: [{ name, data: data }],
                blockTime: Math.floor(Date.now() / 1000),
                signature
            }).then(() => true).catch(e => {
                this.logger.error("getWsEventHandler(" + name + "): Error processing signature: " + signature, e);
                return false;
            });
        };
    }
    /**
     * Sets up event handlers listening for swap events over websocket
     *
     * @protected
     */
    setupWebsocket() {
        const program = this.solanaSwapProgram.program;
        this.eventListeners.push(program.addEventListener("InitializeEvent", this.getWsEventHandler("InitializeEvent")));
        this.eventListeners.push(program.addEventListener("ClaimEvent", this.getWsEventHandler("ClaimEvent")));
        this.eventListeners.push(program.addEventListener("RefundEvent", this.getWsEventHandler("RefundEvent")));
    }
    /**
     * Gets all the new signatures from the last processed signature
     *
     * @param lastProcessedSignature
     * @private
     */
    async getNewSignatures(lastProcessedSignature) {
        let signatures = [];
        let fetched = null;
        while (fetched == null || fetched.length === this.logFetchLimit) {
            if (signatures.length === 0) {
                fetched = await this.connection.getSignaturesForAddress(this.solanaSwapProgram.program.programId, {
                    until: lastProcessedSignature.signature,
                    limit: this.logFetchLimit
                }, "confirmed");
                //Check if newest returned signature (index 0) is older than the latest signature's slot, this is a sanity check
                if (fetched.length > 0 && fetched[0].slot < lastProcessedSignature.slot) {
                    this.logger.debug("getNewSignatures(): Sanity check triggered, returned signature slot height is older than latest!");
                    return null;
                }
            }
            else {
                fetched = await this.connection.getSignaturesForAddress(this.solanaSwapProgram.program.programId, {
                    before: signatures[signatures.length - 1].signature,
                    until: lastProcessedSignature.signature,
                    limit: this.logFetchLimit
                }, "confirmed");
            }
            signatures = signatures.concat(fetched);
        }
        return signatures;
    }
    /**
     * Gets single latest known signature
     *
     * @private
     */
    async getFirstSignature() {
        return await this.connection.getSignaturesForAddress(this.solanaSwapProgram.program.programId, {
            limit: 1
        }, "confirmed");
    }
    /**
     * Processes signatures, fetches transactions & processes event through event handlers
     *
     * @param signatures
     * @private
     * @returns {Promise<{signature: string, slot: number}>} latest processed transaction signature and slot height
     */
    async processSignatures(signatures) {
        let lastSuccessfulSignature = null;
        try {
            for (let i = signatures.length - 1; i >= 0; i--) {
                const txSignature = signatures[i];
                //Check if signature is already being processed by the
                const signaturePromise = this.signaturesProcessing[txSignature.signature];
                if (signaturePromise != null) {
                    const result = await signaturePromise;
                    delete this.signaturesProcessing[txSignature.signature];
                    if (result) {
                        lastSuccessfulSignature = txSignature;
                        this.addProcessedSignature(txSignature.signature);
                        continue;
                    }
                }
                this.logger.debug("processSignatures(): Process signature: ", txSignature);
                const processPromise = this.fetchTxAndProcessEvent(txSignature.signature);
                this.signaturesProcessing[txSignature.signature] = processPromise;
                const result = await processPromise;
                if (!result)
                    throw new Error("Failed to process signature: " + txSignature);
                lastSuccessfulSignature = txSignature;
                this.addProcessedSignature(txSignature.signature);
                delete this.signaturesProcessing[txSignature.signature];
            }
        }
        catch (e) {
            this.logger.error("processSignatures(): Failed processing signatures: ", e);
        }
        return lastSuccessfulSignature;
    }
    /**
     * Polls for new events & processes them
     *
     * @private
     */
    async poll(lastSignature) {
        let signatures = lastSignature == null
            ? await this.getFirstSignature()
            : await this.getNewSignatures(lastSignature);
        if (signatures == null)
            return lastSignature ?? null;
        let lastSuccessfulSignature = await this.processSignatures(signatures);
        return lastSuccessfulSignature ?? lastSignature ?? null;
    }
    init(noAutomaticPoll) {
        if (noAutomaticPoll)
            return Promise.resolve();
        this.setupWebsocket();
        return Promise.resolve();
    }
    async stop() {
        for (let num of this.eventListeners) {
            await this.solanaSwapProgram.program.removeEventListener(num);
        }
        this.eventListeners = [];
    }
    registerListener(cbk) {
        this.listeners.push(cbk);
    }
    unregisterListener(cbk) {
        const index = this.listeners.indexOf(cbk);
        if (index >= 0) {
            this.listeners.splice(index, 1);
            return true;
        }
        return false;
    }
}
exports.SolanaChainEventsBrowser = SolanaChainEventsBrowser;
