import {ChainEvents, ClaimEvent, EventListener, InitializeEvent, RefundEvent, SwapEvent} from "@atomiqlabs/base";
import {InitInstruction, SolanaSwapData} from "../swaps/SolanaSwapData";
import {IdlEvents} from "@coral-xyz/anchor";
import {SolanaSwapProgram} from "../swaps/SolanaSwapProgram";
import {
    getLogger,
    onceAsync, toEscrowHash, tryWithRetries
} from "../../utils/Utils";
import {ConfirmedSignatureInfo, Connection, ParsedTransactionWithMeta} from "@solana/web3.js";
import {SwapTypeEnum} from "../swaps/SwapTypeEnum";
import {
    InstructionWithAccounts,
    ProgramEvent
} from "../program/modules/SolanaProgramEvents";
import {SwapProgram} from "../swaps/v1/programTypes";
import {Buffer} from "buffer";

/**
 * Parsed event payload grouped by originating transaction metadata.
 *
 * @category Events
 */
export type EventObject = {
    events: ProgramEvent<SwapProgram>[],
    instructions?: (InstructionWithAccounts<SwapProgram> | null)[],
    blockTime: number,
    signature: string
};

const LOG_FETCH_LIMIT = 500;
const PROCESSED_SIGNATURES_BACKLOG = 500;

/**
 * Legacy current cursor of Solana event listener state.
 *
 * @category Events
 */
export type SolanaLegacyEventListenerState = {
    /**
     * Last processed transaction's signature
     */
    signature: string,
    /**
     * Last processed transaction's slot
     */
    slot: number
};

/**
 * Current cursor of Solana event listener state.
 *
 * @category Events
 */
export type SolanaEventListenerState = {
    [version: string]: SolanaLegacyEventListenerState | null
};

function toNewEventListenerState(obj: SolanaLegacyEventListenerState | SolanaEventListenerState | undefined): SolanaEventListenerState | undefined {
    if(obj==null) return undefined;
    if(obj.slot!=null || obj.signature!=null) return {"v1": obj} as SolanaEventListenerState;
    return obj as SolanaEventListenerState;
}

/**
 * Solana on-chain event handler for front-end systems without access to fs, uses pure WS to subscribe, might lose
 *  out on some events if the network is unreliable, front-end systems should take this into consideration and not
 *  rely purely on events
 *
 * @category Events
 */
export class SolanaChainEventsBrowser implements ChainEvents<SolanaSwapData, SolanaLegacyEventListenerState | SolanaEventListenerState> {

    /**
     * @internal
     */
    protected readonly listeners: EventListener<SolanaSwapData>[] = [];
    /**
     * @internal
     */
    protected readonly connection: Connection;
    /**
     * @internal
     */
    protected readonly contractVersions: {[version: string]: {swapContract: SolanaSwapProgram}};
    /**
     * @internal
     */
    protected eventListeners: {[version: string]: number[]} = {};
    /**
     * @internal
     */
    protected readonly logger = getLogger("SolanaChainEventsBrowser: ");

    private readonly logFetchLimit: number;
    private signaturesProcessing: {
        [signature: string]: Promise<boolean>
    } = {};
    private processedSignatures: string[] = [];
    private processedSignaturesIndex: number = 0;

    constructor(
        connection: Connection,
        contractVersions: SolanaSwapProgram | {[version: string]: {swapContract: SolanaSwapProgram}},
        logFetchLimit?: number
    ) {
        this.connection = connection;
        if(contractVersions instanceof SolanaSwapProgram) {
            this.contractVersions = {[contractVersions.version]: {swapContract: contractVersions}};
        } else {
            this.contractVersions = contractVersions;
        }
        this.logFetchLimit = logFetchLimit ?? LOG_FETCH_LIMIT;
    }

    private addProcessedSignature(signature: string, version: string) {
        this.processedSignatures[this.processedSignaturesIndex] = signature+"-"+version;
        this.processedSignaturesIndex += 1;
        if(this.processedSignaturesIndex >= PROCESSED_SIGNATURES_BACKLOG) this.processedSignaturesIndex = 0;
    }

    private isSignatureProcessed(signature: string, version: string): boolean {
        return this.processedSignatures.includes(signature+"-"+version);
    }

    /**
     * Parses EventObject from the transaction
     *
     * @param transaction
     * @param version
     * @private
     * @returns {EventObject} parsed event object
     */
    private getEventObjectFromTransaction(transaction: ParsedTransactionWithMeta, version: string): EventObject | null {
        const signature = transaction.transaction.signatures[0];
        if(transaction.meta==null) throw new Error(`Transaction 'meta' not found for Solana tx: ${signature}`);
        if(transaction.meta.err!=null || transaction.meta.logMessages==null) return null;

        const instructions = this.contractVersions[version].swapContract._Events.decodeInstructions(transaction.transaction.message);
        const events = this.contractVersions[version].swapContract._Events.parseLogs(transaction.meta.logMessages);

        return {
            instructions,
            events,
            blockTime: transaction.blockTime!,
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
    private async fetchTxAndProcessEvent(signature: string, version: string): Promise<boolean> {
        try {
            const transaction = await this.connection.getParsedTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 1
            });
            if(transaction==null) return false;

            const eventObject = this.getEventObjectFromTransaction(transaction, version);
            if(eventObject==null) return true;

            await this.processEvent(eventObject, version);
            return true;
        } catch (e) {
            this.logger.error("fetchTxAndProcessEvent(): Error fetching transaction and processing event, signature: "+signature, e);
            return false;
        }
    }

    /**
     * Fetches and parses transaction instructions
     *
     * @private
     * @returns {Promise<(InstructionWithAccounts<SwapProgram> | null)[] | null>} array of parsed instructions
     */
    private async getTransactionInstructions(signature: string, version: string): Promise<(InstructionWithAccounts<SwapProgram> | null)[] | null> {
        const transaction = await tryWithRetries<ParsedTransactionWithMeta>(async () => {
            const res = await this.connection.getParsedTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0
            });
            if(res==null) throw new Error("Transaction not found!");
            return res;
        });
        if(transaction.meta==null) throw new Error("Transaction 'meta' not found!");
        if(transaction.meta.err!=null) return null;
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
    private getSwapDataGetter(eventObject: EventObject, txoHash: string, version: string): () => Promise<SolanaSwapData | null> {
        return async () => {
            if(eventObject.instructions==null) {
                const ixs = await this.getTransactionInstructions(eventObject.signature, version);
                if(ixs==null) return null;
                eventObject.instructions = ixs;
            }

            const initIx = eventObject.instructions.find(
                ix => ix!=null && (ix.name === "offererInitializePayIn" || ix.name === "offererInitialize")
            ) as InitInstruction;
            if(initIx == null) return null;

            return SolanaSwapData.fromInstruction(this.contractVersions[version].swapContract.program.programId, version as "v1" | "v2", initIx, txoHash);
        }
    }

    /**
     * @internal
     */
    protected parseInitializeEvent(data: IdlEvents<SwapProgram>["InitializeEvent"], eventObject: EventObject, version: string): InitializeEvent<SolanaSwapData> {
        const paymentHash: string = Buffer.from(data.hash).toString("hex");
        const txoHash: string = Buffer.from(data.txoHash).toString("hex");
        const escrowHash = toEscrowHash(paymentHash, data.sequence);
        this.logger.debug("InitializeEvent paymentHash: "+paymentHash+" sequence: "+data.sequence.toString(10)+
            " txoHash: "+txoHash+" escrowHash: "+escrowHash);
        return new InitializeEvent<SolanaSwapData>(
            escrowHash,
            SwapTypeEnum.toChainSwapType(data.kind),
            onceAsync<SolanaSwapData | null>(this.getSwapDataGetter(eventObject, txoHash, version)),
            version
        );
    }

    /**
     * @internal
     */
    protected parseRefundEvent(data: IdlEvents<SwapProgram>["RefundEvent"], version: string): RefundEvent<SolanaSwapData> {
        const paymentHash: string = Buffer.from(data.hash).toString("hex");
        const escrowHash = toEscrowHash(paymentHash, data.sequence);
        this.logger.debug("RefundEvent paymentHash: "+paymentHash+" sequence: "+data.sequence.toString(10)+
            " escrowHash: "+escrowHash);
        return new RefundEvent<SolanaSwapData>(escrowHash, version);
    }

    /**
     * @internal
     */
    protected parseClaimEvent(data: IdlEvents<SwapProgram>["ClaimEvent"], version: string): ClaimEvent<SolanaSwapData> {
        const secret: string = Buffer.from(data.secret).toString("hex");
        const paymentHash: string = Buffer.from(data.hash).toString("hex");
        const escrowHash = toEscrowHash(paymentHash, data.sequence);
        this.logger.debug("ClaimEvent paymentHash: "+paymentHash+" sequence: "+data.sequence.toString(10)+
            " secret: "+secret+" escrowHash: "+escrowHash);
        return new ClaimEvent<SolanaSwapData>(escrowHash, secret, version);
    }

    /**
     * Processes event as received from the chain, parses it & calls event listeners
     *
     * @param eventObject
     * @param version
     * @internal
     */
    protected async processEvent(eventObject : EventObject, version: string) {
        let parsedEvents: SwapEvent<SolanaSwapData>[] = eventObject.events.map(event => {
            let parsedEvent: SwapEvent<SolanaSwapData> | undefined;
            switch(event.name) {
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
            if(parsedEvent==null) return null;
            (parsedEvent as any).meta = {
                blockTime: eventObject.blockTime,
                timestamp: eventObject.blockTime,
                txId: eventObject.signature
            };
            return parsedEvent;
        }).filter(parsedEvent => parsedEvent!=null);

        for(let listener of this.listeners) {
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
    protected getWsEventHandler<E extends "InitializeEvent" | "RefundEvent" | "ClaimEvent">(
        name: E,
        version: string
    ): (data: IdlEvents<SwapProgram>[E], slotNumber: number, signature: string) => void {
        return (data: IdlEvents<SwapProgram>[E], slotNumber: number, signature: string) => {
            if(this.signaturesProcessing[signature+"-"+version]!=null) return;
            if(this.isSignatureProcessed(signature, version)) return;

            this.logger.debug("getWsEventHandler("+name+"): Process signature: ", signature);

            this.signaturesProcessing[signature+"-"+version] = this.processEvent({
                events: [{name, data: data as any}],
                blockTime: Math.floor(Date.now()/1000),
                signature
            }, version).then(() => true).catch(e => {
                this.logger.error("getWsEventHandler("+name+"): Error processing signature: "+signature, e);
                return false;
            });
        };
    }

    /**
     * Sets up event handlers listening for swap events over websocket
     *
     * @internal
     */
    protected setupWebsocket() {
        for(let version in this.contractVersions) {
            const program = this.contractVersions[version].swapContract.program;
            const eventListeners = this.eventListeners[version] ??= [];
            eventListeners.push(program.addEventListener<"InitializeEvent">("InitializeEvent", this.getWsEventHandler("InitializeEvent", version)));
            eventListeners.push(program.addEventListener<"ClaimEvent">("ClaimEvent", this.getWsEventHandler("ClaimEvent", version)));
            eventListeners.push(program.addEventListener<"RefundEvent">("RefundEvent", this.getWsEventHandler("RefundEvent", version)));
        }
    }

    /**
     * Gets all the new signatures from the last processed signature
     *
     * @param lastProcessedSignature
     * @param version
     * @private
     */
    private async getNewSignatures(lastProcessedSignature: {signature: string, slot: number}, version: string): Promise<ConfirmedSignatureInfo[] | null> {
        let signatures: ConfirmedSignatureInfo[] = [];

        let fetched = null;
        while(fetched==null || fetched.length===this.logFetchLimit) {
            if(signatures.length===0) {
                fetched = await this.connection.getSignaturesForAddress(this.contractVersions[version].swapContract.program.programId, {
                    until: lastProcessedSignature.signature,
                    limit: this.logFetchLimit
                }, "confirmed");
                //Check if newest returned signature (index 0) is older than the latest signature's slot, this is a sanity check
                if(fetched.length>0 && fetched[0].slot<lastProcessedSignature.slot) {
                    this.logger.debug("getNewSignatures(): Sanity check triggered, returned signature slot height is older than latest!");
                    return null;
                }
            } else {
                fetched = await this.connection.getSignaturesForAddress(this.contractVersions[version].swapContract.program.programId, {
                    before: signatures[signatures.length-1].signature,
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
    private async getFirstSignature(version: string): Promise<ConfirmedSignatureInfo[]> {
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
    private async processSignatures(signatures: ConfirmedSignatureInfo[], version: string): Promise<{signature: string, slot: number} | null> {
        let lastSuccessfulSignature: {signature: string, slot: number} | null = null;

        try {
            for(let i=signatures.length-1;i>=0;i--) {
                const txSignature = signatures[i];

                //Check if signature is already being processed by the
                const signaturePromise = this.signaturesProcessing[txSignature.signature+"-"+version];
                if(signaturePromise!=null) {
                    const result = await signaturePromise;
                    delete this.signaturesProcessing[txSignature.signature+"-"+version];
                    if(result) {
                        lastSuccessfulSignature = txSignature;
                        this.addProcessedSignature(txSignature.signature, version);
                        continue;
                    }
                }

                this.logger.debug("processSignatures(): Process signature: ", txSignature);

                const processPromise: Promise<boolean> = this.fetchTxAndProcessEvent(txSignature.signature, version);
                this.signaturesProcessing[txSignature.signature+"-"+version] = processPromise;

                const result = await processPromise;
                if(!result) throw new Error("Failed to process signature: "+txSignature);
                lastSuccessfulSignature = txSignature;
                this.addProcessedSignature(txSignature.signature, version);
                delete this.signaturesProcessing[txSignature.signature+"-"+version];
            }
        } catch (e) {
            this.logger.error("processSignatures(): Failed processing signatures: ", e);
        }
        return lastSuccessfulSignature;
    }

    /**
     * @inheritDoc
     */
    async poll(lastSignature?: SolanaLegacyEventListenerState | SolanaEventListenerState): Promise<SolanaEventListenerState> {
        const _lastSignature = toNewEventListenerState(lastSignature);

        const result: SolanaEventListenerState = {};
        for(let version in this.contractVersions) {
            const lastSignature = _lastSignature?.[version];

            let signatures = lastSignature==null
                ? await this.getFirstSignature(version)
                : await this.getNewSignatures(lastSignature, version);
            if(signatures==null) {
                result[version] = lastSignature ?? null;
            } else {
                let lastSuccessfulSignature = await this.processSignatures(signatures, version);
                result[version] = lastSuccessfulSignature ?? lastSignature ?? null;
            }
        }

        return result;
    }

    /**
     * @inheritDoc
     */
    init(noAutomaticPoll?: boolean): Promise<void> {
        if(noAutomaticPoll) return Promise.resolve();
        this.setupWebsocket();
        return Promise.resolve();
    }

    /**
     * @inheritDoc
     */
    async stop(): Promise<void> {
        for(let version in this.eventListeners) {
            for(let num of this.eventListeners[version]) {
                await this.contractVersions[version].swapContract.program.removeEventListener(num);
            }
        }
        this.eventListeners = {};
    }

    /**
     * @inheritDoc
     */
    registerListener(cbk: EventListener<SolanaSwapData>): void {
        this.listeners.push(cbk);
    }

    /**
     * @inheritDoc
     */
    unregisterListener(cbk: EventListener<SolanaSwapData>): boolean {
        const index = this.listeners.indexOf(cbk);
        if(index>=0) {
            this.listeners.splice(index, 1);
            return true;
        }
        return false;
    }
}
