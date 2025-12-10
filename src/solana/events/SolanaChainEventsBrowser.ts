import {ChainEvents, ClaimEvent, EventListener, InitializeEvent, RefundEvent, SwapEvent} from "@atomiqlabs/base";
import {InitInstruction, SolanaSwapData} from "../swaps/SolanaSwapData";
import {IdlEvents} from "@coral-xyz/anchor";
import {SolanaSwapProgram} from "../swaps/SolanaSwapProgram";
import {
    getLogger,
    onceAsync, toEscrowHash, tryWithRetries
} from "../../utils/Utils";
import {Connection, ParsedTransactionWithMeta} from "@solana/web3.js";
import {SwapTypeEnum} from "../swaps/SwapTypeEnum";
import {
    InstructionWithAccounts,
    ProgramEvent
} from "../program/modules/SolanaProgramEvents";
import {SwapProgram} from "../swaps/programTypes";
import {Buffer} from "buffer";

export type EventObject = {
    events: ProgramEvent<SwapProgram>[],
    instructions?: (InstructionWithAccounts<SwapProgram> | null)[],
    blockTime: number,
    signature: string
};

/**
 * Solana on-chain event handler for front-end systems without access to fs, uses pure WS to subscribe, might lose
 *  out on some events if the network is unreliable, front-end systems should take this into consideration and not
 *  rely purely on events
 */
export class SolanaChainEventsBrowser implements ChainEvents<SolanaSwapData> {

    protected readonly listeners: EventListener<SolanaSwapData>[] = [];
    protected readonly connection: Connection;
    protected readonly solanaSwapProgram: SolanaSwapProgram;
    protected eventListeners: number[] = [];
    protected readonly logger = getLogger("SolanaChainEventsBrowser: ");

    constructor(connection: Connection, solanaSwapContract: SolanaSwapProgram) {
        this.connection = connection;
        this.solanaSwapProgram = solanaSwapContract;
    }

    /**
     * Fetches and parses transaction instructions
     *
     * @private
     * @returns {Promise<(InstructionWithAccounts<SwapProgram> | null)[] | null>} array of parsed instructions
     */
    private async getTransactionInstructions(signature: string): Promise<(InstructionWithAccounts<SwapProgram> | null)[] | null> {
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
    private getSwapDataGetter(eventObject: EventObject, txoHash: string): () => Promise<SolanaSwapData | null> {
        return async () => {
            if(eventObject.instructions==null) {
                const ixs = await this.getTransactionInstructions(eventObject.signature);
                if(ixs==null) return null;
                eventObject.instructions = ixs;
            }

            const initIx = eventObject.instructions.find(
                ix => ix!=null && (ix.name === "offererInitializePayIn" || ix.name === "offererInitialize")
            ) as InitInstruction;
            if(initIx == null) return null;

            return SolanaSwapData.fromInstruction(initIx, txoHash);
        }
    }

    protected parseInitializeEvent(data: IdlEvents<SwapProgram>["InitializeEvent"], eventObject: EventObject): InitializeEvent<SolanaSwapData> {
        const paymentHash: string = Buffer.from(data.hash).toString("hex");
        const txoHash: string = Buffer.from(data.txoHash).toString("hex");
        const escrowHash = toEscrowHash(paymentHash, data.sequence);
        this.logger.debug("InitializeEvent paymentHash: "+paymentHash+" sequence: "+data.sequence.toString(10)+
            " txoHash: "+txoHash+" escrowHash: "+escrowHash);
        return new InitializeEvent<SolanaSwapData>(
            escrowHash,
            SwapTypeEnum.toChainSwapType(data.kind),
            onceAsync<SolanaSwapData | null>(this.getSwapDataGetter(eventObject, txoHash))
        );
    }

    protected parseRefundEvent(data: IdlEvents<SwapProgram>["RefundEvent"]): RefundEvent<SolanaSwapData> {
        const paymentHash: string = Buffer.from(data.hash).toString("hex");
        const escrowHash = toEscrowHash(paymentHash, data.sequence);
        this.logger.debug("RefundEvent paymentHash: "+paymentHash+" sequence: "+data.sequence.toString(10)+
            " escrowHash: "+escrowHash);
        return new RefundEvent<SolanaSwapData>(escrowHash);
    }

    protected parseClaimEvent(data: IdlEvents<SwapProgram>["ClaimEvent"]): ClaimEvent<SolanaSwapData> {
        const secret: string = Buffer.from(data.secret).toString("hex");
        const paymentHash: string = Buffer.from(data.hash).toString("hex");
        const escrowHash = toEscrowHash(paymentHash, data.sequence);
        this.logger.debug("ClaimEvent paymentHash: "+paymentHash+" sequence: "+data.sequence.toString(10)+
            " secret: "+secret+" escrowHash: "+escrowHash);
        return new ClaimEvent<SolanaSwapData>(escrowHash, secret);
    }

    /**
     * Processes event as received from the chain, parses it & calls event listeners
     *
     * @param eventObject
     * @protected
     */
    protected async processEvent(eventObject : EventObject) {
        let parsedEvents: SwapEvent<SolanaSwapData>[] = eventObject.events.map(event => {
            let parsedEvent: SwapEvent<SolanaSwapData>;
            switch(event.name) {
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
     * @protected
     * @returns event handler to be passed to program's addEventListener function
     */
    protected getWsEventHandler<E extends "InitializeEvent" | "RefundEvent" | "ClaimEvent">(
        name: E
    ): (data: IdlEvents<SwapProgram>[E], slotNumber: number, signature: string) => void {
        return (data: IdlEvents<SwapProgram>[E], slotNumber: number, signature: string) => {
            this.logger.debug("wsEventHandler: Process signature: ", signature);

            this.processEvent({
                events: [{name, data: data as any}],
                blockTime: Math.floor(Date.now()/1000),
                signature
            }).then(() => true).catch(e => {
                this.logger.error("wsEventHandler: Error when processing signature: "+signature, e);
                return false;
            });
        };
    }

    /**
     * Sets up event handlers listening for swap events over websocket
     *
     * @protected
     */
    protected setupWebsocket() {
        const program = this.solanaSwapProgram.program;
        this.eventListeners.push(program.addEventListener<"InitializeEvent">("InitializeEvent", this.getWsEventHandler("InitializeEvent")));
        this.eventListeners.push(program.addEventListener<"ClaimEvent">("ClaimEvent", this.getWsEventHandler("ClaimEvent")));
        this.eventListeners.push(program.addEventListener<"RefundEvent">("RefundEvent", this.getWsEventHandler("RefundEvent")));
    }

    init(): Promise<void> {
        this.setupWebsocket();
        return Promise.resolve();
    }

    async stop(): Promise<void> {
        for(let num of this.eventListeners) {
            await this.solanaSwapProgram.program.removeEventListener(num);
        }
        this.eventListeners = [];
    }

    registerListener(cbk: EventListener<SolanaSwapData>): void {
        this.listeners.push(cbk);
    }

    unregisterListener(cbk: EventListener<SolanaSwapData>): boolean {
        const index = this.listeners.indexOf(cbk);
        if(index>=0) {
            this.listeners.splice(index, 1);
            return true;
        }
        return false;
    }
}
