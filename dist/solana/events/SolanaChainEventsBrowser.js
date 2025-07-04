"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaChainEventsBrowser = void 0;
const base_1 = require("@atomiqlabs/base");
const SolanaSwapData_1 = require("../swaps/SolanaSwapData");
const Utils_1 = require("../../utils/Utils");
const web3_js_1 = require("@solana/web3.js");
const BN = require("bn.js");
const SwapTypeEnum_1 = require("../swaps/SwapTypeEnum");
const buffer_1 = require("buffer");
/**
 * Solana on-chain event handler for front-end systems without access to fs, uses pure WS to subscribe, might lose
 *  out on some events if the network is unreliable, front-end systems should take this into consideration and not
 *  rely purely on events
 */
class SolanaChainEventsBrowser {
    constructor(connection, solanaSwapContract) {
        this.listeners = [];
        this.eventListeners = [];
        this.logger = (0, Utils_1.getLogger)("SolanaChainEventsBrowser: ");
        this.connection = connection;
        this.solanaSwapProgram = solanaSwapContract;
    }
    /**
     * Fetches and parses transaction instructions
     *
     * @private
     * @returns {Promise<InstructionWithAccounts<SwapProgram>[]>} array of parsed instructions
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
        if (transaction == null)
            return null;
        if (transaction.meta.err != null)
            return null;
        return this.solanaSwapProgram.Events.decodeInstructions(transaction.transaction.message);
    }
    /**
     * Converts initialize instruction data into {SolanaSwapData}
     *
     * @param initIx
     * @param txoHash
     * @private
     * @returns {SolanaSwapData} converted and parsed swap data
     */
    instructionToSwapData(initIx, txoHash) {
        const paymentHash = buffer_1.Buffer.from(initIx.data.swapData.hash);
        let securityDeposit = new BN(0);
        let claimerBounty = new BN(0);
        let payIn = true;
        if (initIx.name === "offererInitialize") {
            payIn = false;
            securityDeposit = initIx.data.securityDeposit;
            claimerBounty = initIx.data.claimerBounty;
        }
        return new SolanaSwapData_1.SolanaSwapData(initIx.accounts.offerer, initIx.accounts.claimer, initIx.accounts.mint, initIx.data.swapData.amount, paymentHash.toString("hex"), initIx.data.swapData.sequence, initIx.data.swapData.expiry, initIx.data.swapData.nonce, initIx.data.swapData.confirmations, initIx.data.swapData.payOut, SwapTypeEnum_1.SwapTypeEnum.toNumber(initIx.data.swapData.kind), payIn, initIx.name === "offererInitializePayIn" ? initIx.accounts.offererAta : web3_js_1.PublicKey.default, initIx.data.swapData.payOut ? initIx.accounts.claimerAta : web3_js_1.PublicKey.default, securityDeposit, claimerBounty, txoHash);
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
            if (eventObject.instructions == null)
                eventObject.instructions = await this.getTransactionInstructions(eventObject.signature);
            if (eventObject.instructions == null)
                return null;
            const initIx = eventObject.instructions.find(ix => ix != null && (ix.name === "offererInitializePayIn" || ix.name === "offererInitialize"));
            if (initIx == null)
                return null;
            return this.instructionToSwapData(initIx, txoHash);
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
            this.logger.debug("wsEventHandler: Process signature: ", signature);
            this.processEvent({
                events: [{ name, data: data }],
                instructions: null,
                blockTime: Math.floor(Date.now() / 1000),
                signature
            }).then(() => true).catch(e => {
                this.logger.error("wsEventHandler: Error when processing signature: " + signature, e);
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
    init() {
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
