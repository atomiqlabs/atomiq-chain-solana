"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaChainEventsBrowser = void 0;
const base_1 = require("@atomiqlabs/base");
const SolanaSwapData_1 = require("../swaps/SolanaSwapData");
const SolanaSwapProgram_1 = require("../swaps/SolanaSwapProgram");
const Utils_1 = require("../../utils/Utils");
const SwapTypeEnum_1 = require("../swaps/SwapTypeEnum");
const buffer_1 = require("buffer");
const LOG_FETCH_LIMIT = 500;
const PROCESSED_SIGNATURES_BACKLOG = 500;
function toNewEventListenerState(obj) {
    if (obj == null)
        return undefined;
    if (obj.slot != null || obj.signature != null)
        return { "v1": obj };
    return obj;
}
/**
 * Solana on-chain event handler for front-end systems without access to fs, uses pure WS to subscribe, might lose
 *  out on some events if the network is unreliable, front-end systems should take this into consideration and not
 *  rely purely on events
 *
 * @category Events
 */
class SolanaChainEventsBrowser {
    constructor(connection, contractVersions, logFetchLimit) {
        /**
         * @internal
         */
        this.listeners = [];
        /**
         * @internal
         */
        this.eventListeners = {};
        /**
         * @internal
         */
        this.logger = (0, Utils_1.getLogger)("SolanaChainEventsBrowser: ");
        this.signaturesProcessing = {};
        this.processedSignatures = [];
        this.processedSignaturesIndex = 0;
        this.connection = connection;
        if (contractVersions instanceof SolanaSwapProgram_1.SolanaSwapProgram) {
            this.contractVersions = { [contractVersions.version]: { swapContract: contractVersions } };
        }
        else {
            this.contractVersions = contractVersions;
        }
        this.logFetchLimit = logFetchLimit ?? LOG_FETCH_LIMIT;
    }
    addProcessedSignature(signature, version) {
        this.processedSignatures[this.processedSignaturesIndex] = signature + "-" + version;
        this.processedSignaturesIndex += 1;
        if (this.processedSignaturesIndex >= PROCESSED_SIGNATURES_BACKLOG)
            this.processedSignaturesIndex = 0;
    }
    isSignatureProcessed(signature, version) {
        return this.processedSignatures.includes(signature + "-" + version);
    }
    /**
     * Parses EventObject from the transaction
     *
     * @param transaction
     * @param version
     * @private
     * @returns {EventObject} parsed event object
     */
    getEventObjectFromTransaction(transaction, version) {
        const signature = transaction.transaction.signatures[0];
        if (transaction.meta == null)
            throw new Error(`Transaction 'meta' not found for Solana tx: ${signature}`);
        if (transaction.meta.err != null || transaction.meta.logMessages == null)
            return null;
        const instructions = this.contractVersions[version].swapContract._Events.decodeInstructions(transaction.transaction.message);
        const events = this.contractVersions[version].swapContract._Events.parseLogs(transaction.meta.logMessages);
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
     * @param version
     * @private
     * @returns {boolean} whether the operation was successful
     */
    async fetchTxAndProcessEvent(signature, version) {
        try {
            const transaction = await this.connection.getParsedTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 1
            });
            if (transaction == null)
                return false;
            const eventObject = this.getEventObjectFromTransaction(transaction, version);
            if (eventObject == null)
                return true;
            await this.processEvent(eventObject, version);
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
    async getTransactionInstructions(signature, version) {
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
        return this.contractVersions[version].swapContract._Events.decodeInstructions(transaction.transaction.message);
    }
    /**
     * Returns async getter for fetching on-demand initialize event swap data
     *
     * @param eventObject
     * @param txoHash
     * @param version
     * @private
     * @returns {() => Promise<SolanaSwapData>} getter to be passed to InitializeEvent constructor
     */
    getSwapDataGetter(eventObject, txoHash, version) {
        return async () => {
            if (eventObject.instructions == null) {
                const ixs = await this.getTransactionInstructions(eventObject.signature, version);
                if (ixs == null)
                    return null;
                eventObject.instructions = ixs;
            }
            const initIx = eventObject.instructions.find(ix => ix != null && (ix.name === "offererInitializePayIn" || ix.name === "offererInitialize"));
            if (initIx == null)
                return null;
            return SolanaSwapData_1.SolanaSwapData.fromInstruction(this.contractVersions[version].swapContract.program.programId, version, initIx, txoHash);
        };
    }
    /**
     * @internal
     */
    parseInitializeEvent(data, eventObject, version) {
        const paymentHash = buffer_1.Buffer.from(data.hash).toString("hex");
        const txoHash = buffer_1.Buffer.from(data.txoHash).toString("hex");
        const escrowHash = (0, Utils_1.toEscrowHash)(paymentHash, data.sequence);
        this.logger.debug("InitializeEvent paymentHash: " + paymentHash + " sequence: " + data.sequence.toString(10) +
            " txoHash: " + txoHash + " escrowHash: " + escrowHash);
        return new base_1.InitializeEvent(escrowHash, SwapTypeEnum_1.SwapTypeEnum.toChainSwapType(data.kind), (0, Utils_1.onceAsync)(this.getSwapDataGetter(eventObject, txoHash, version)), version);
    }
    /**
     * @internal
     */
    parseRefundEvent(data, version) {
        const paymentHash = buffer_1.Buffer.from(data.hash).toString("hex");
        const escrowHash = (0, Utils_1.toEscrowHash)(paymentHash, data.sequence);
        this.logger.debug("RefundEvent paymentHash: " + paymentHash + " sequence: " + data.sequence.toString(10) +
            " escrowHash: " + escrowHash);
        return new base_1.RefundEvent(escrowHash, version);
    }
    /**
     * @internal
     */
    parseClaimEvent(data, version) {
        const secret = buffer_1.Buffer.from(data.secret).toString("hex");
        const paymentHash = buffer_1.Buffer.from(data.hash).toString("hex");
        const escrowHash = (0, Utils_1.toEscrowHash)(paymentHash, data.sequence);
        this.logger.debug("ClaimEvent paymentHash: " + paymentHash + " sequence: " + data.sequence.toString(10) +
            " secret: " + secret + " escrowHash: " + escrowHash);
        return new base_1.ClaimEvent(escrowHash, secret, version);
    }
    /**
     * Processes event as received from the chain, parses it & calls event listeners
     *
     * @param eventObject
     * @param version
     * @internal
     */
    async processEvent(eventObject, version) {
        let parsedEvents = eventObject.events.map(event => {
            let parsedEvent;
            switch (event.name) {
                case "ClaimEvent":
                    parsedEvent = this.parseClaimEvent(event.data, version);
                    break;
                case "RefundEvent":
                    parsedEvent = this.parseRefundEvent(event.data, version);
                    break;
                case "InitializeEvent":
                    parsedEvent = this.parseInitializeEvent(event.data, eventObject, version);
                    break;
            }
            if (parsedEvent == null)
                return null;
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
     * @param version
     * @internal
     * @returns event handler to be passed to program's addEventListener function
     */
    getWsEventHandler(name, version) {
        return (data, slotNumber, signature) => {
            if (this.signaturesProcessing[signature + "-" + version] != null)
                return;
            if (this.isSignatureProcessed(signature, version))
                return;
            this.logger.debug("getWsEventHandler(" + name + "): Process signature: ", signature);
            this.signaturesProcessing[signature + "-" + version] = this.processEvent({
                events: [{ name, data: data }],
                blockTime: Math.floor(Date.now() / 1000),
                signature
            }, version).then(() => true).catch(e => {
                this.logger.error("getWsEventHandler(" + name + "): Error processing signature: " + signature, e);
                return false;
            });
        };
    }
    /**
     * Sets up event handlers listening for swap events over websocket
     *
     * @internal
     */
    setupWebsocket() {
        var _a;
        for (let version in this.contractVersions) {
            const program = this.contractVersions[version].swapContract.program;
            const eventListeners = (_a = this.eventListeners)[version] ?? (_a[version] = []);
            eventListeners.push(program.addEventListener("InitializeEvent", this.getWsEventHandler("InitializeEvent", version)));
            eventListeners.push(program.addEventListener("ClaimEvent", this.getWsEventHandler("ClaimEvent", version)));
            eventListeners.push(program.addEventListener("RefundEvent", this.getWsEventHandler("RefundEvent", version)));
        }
    }
    /**
     * Gets all the new signatures from the last processed signature
     *
     * @param lastProcessedSignature
     * @param version
     * @private
     */
    async getNewSignatures(lastProcessedSignature, version) {
        let signatures = [];
        let fetched = null;
        while (fetched == null || fetched.length === this.logFetchLimit) {
            if (signatures.length === 0) {
                fetched = await this.connection.getSignaturesForAddress(this.contractVersions[version].swapContract.program.programId, {
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
                fetched = await this.connection.getSignaturesForAddress(this.contractVersions[version].swapContract.program.programId, {
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
    async getFirstSignature(version) {
        return await this.connection.getSignaturesForAddress(this.contractVersions[version].swapContract.program.programId, {
            limit: 1
        }, "confirmed");
    }
    /**
     * Processes signatures, fetches transactions & processes event through event handlers
     *
     * @param signatures
     * @param version
     * @private
     * @returns {Promise<{signature: string, slot: number}>} latest processed transaction signature and slot height
     */
    async processSignatures(signatures, version) {
        let lastSuccessfulSignature = null;
        try {
            for (let i = signatures.length - 1; i >= 0; i--) {
                const txSignature = signatures[i];
                //Check if signature is already being processed by the
                const signaturePromise = this.signaturesProcessing[txSignature.signature + "-" + version];
                if (signaturePromise != null) {
                    const result = await signaturePromise;
                    delete this.signaturesProcessing[txSignature.signature + "-" + version];
                    if (result) {
                        lastSuccessfulSignature = txSignature;
                        this.addProcessedSignature(txSignature.signature, version);
                        continue;
                    }
                }
                this.logger.debug("processSignatures(): Process signature: ", txSignature);
                const processPromise = this.fetchTxAndProcessEvent(txSignature.signature, version);
                this.signaturesProcessing[txSignature.signature + "-" + version] = processPromise;
                const result = await processPromise;
                if (!result)
                    throw new Error("Failed to process signature: " + txSignature);
                lastSuccessfulSignature = txSignature;
                this.addProcessedSignature(txSignature.signature, version);
                delete this.signaturesProcessing[txSignature.signature + "-" + version];
            }
        }
        catch (e) {
            this.logger.error("processSignatures(): Failed processing signatures: ", e);
        }
        return lastSuccessfulSignature;
    }
    /**
     * @inheritDoc
     */
    async poll(lastSignature) {
        const _lastSignature = toNewEventListenerState(lastSignature);
        const result = {};
        for (let version in this.contractVersions) {
            const lastSignature = _lastSignature?.[version];
            let signatures = lastSignature == null
                ? await this.getFirstSignature(version)
                : await this.getNewSignatures(lastSignature, version);
            if (signatures == null) {
                result[version] = lastSignature ?? null;
            }
            else {
                let lastSuccessfulSignature = await this.processSignatures(signatures, version);
                result[version] = lastSuccessfulSignature ?? lastSignature ?? null;
            }
        }
        return result;
    }
    /**
     * @inheritDoc
     */
    init(noAutomaticPoll) {
        if (noAutomaticPoll)
            return Promise.resolve();
        this.setupWebsocket();
        return Promise.resolve();
    }
    /**
     * @inheritDoc
     */
    async stop() {
        for (let version in this.eventListeners) {
            for (let num of this.eventListeners[version]) {
                await this.contractVersions[version].swapContract.program.removeEventListener(num);
            }
        }
        this.eventListeners = {};
    }
    /**
     * @inheritDoc
     */
    registerListener(cbk) {
        this.listeners.push(cbk);
    }
    /**
     * @inheritDoc
     */
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
