import {ConfirmedSignatureInfo, Connection, ParsedTransactionWithMeta} from "@solana/web3.js";
import {IdlEvents} from "@coral-xyz/anchor";
import * as fs from "fs/promises";
import {SolanaSwapProgram} from "../swaps/SolanaSwapProgram";
import {EventObject, SolanaChainEventsBrowser} from "./SolanaChainEventsBrowser";
import {SwapProgram} from "../swaps/programTypes";

const BLOCKHEIGHT_FILENAME = "/blockheight.txt";
const LOG_FETCH_INTERVAL = 5*1000;
const LOG_FETCH_LIMIT = 500;

const PROCESSED_SIGNATURES_BACKLOG = 100;

/**
 * Event handler for backend Node.js systems with access to fs, uses HTTP polling in combination with WS to not miss
 *  any events
 */
export class SolanaChainEvents extends SolanaChainEventsBrowser {

    private readonly directory: string;
    private readonly logFetchInterval: number;
    private readonly logFetchLimit: number;

    private signaturesProcessing: {
        [signature: string]: Promise<boolean>
    } = {};
    private processedSignatures: string[] = [];
    private processedSignaturesIndex: number = 0;
    private stopped: boolean = true;
    private timeout?: NodeJS.Timeout;

    constructor(
        directory: string,
        connection: Connection,
        solanaSwapProgram: SolanaSwapProgram,
        logFetchInterval?: number,
        logFetchLimit?: number
    ) {
        super(connection, solanaSwapProgram)
        this.directory = directory;
        this.logFetchInterval = logFetchInterval || LOG_FETCH_INTERVAL;
        this.logFetchLimit = logFetchLimit || LOG_FETCH_LIMIT;
    }

    private addProcessedSignature(signature: string) {
        this.processedSignatures[this.processedSignaturesIndex] = signature;
        this.processedSignaturesIndex += 1;
        if(this.processedSignaturesIndex >= PROCESSED_SIGNATURES_BACKLOG) this.processedSignaturesIndex = 0;
    }

    private isSignatureProcessed(signature: string): boolean {
        return this.processedSignatures.includes(signature);
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
     * Parses EventObject from the transaction
     *
     * @param transaction
     * @private
     * @returns {EventObject} parsed event object
     */
    private getEventObjectFromTransaction(transaction: ParsedTransactionWithMeta): EventObject | null {
        const signature = transaction.transaction.signatures[0];
        if(transaction.meta==null) throw new Error(`Transaction 'meta' not found for Solana tx: ${signature}`);
        if(transaction.meta.err!=null || transaction.meta.logMessages==null) return null;

        const instructions = this.solanaSwapProgram.Events.decodeInstructions(transaction.transaction.message);
        const events = this.solanaSwapProgram.Events.parseLogs(transaction.meta.logMessages);

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
     * @private
     * @returns {boolean} whether the operation was successful
     */
    private async fetchTxAndProcessEvent(signature: string): Promise<boolean> {
        try {
            const transaction = await this.connection.getParsedTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 1
            });
            if(transaction==null) return false;

            const eventObject = this.getEventObjectFromTransaction(transaction);
            if(eventObject==null) return true;

            await this.processEvent(eventObject);
            return true;
        } catch (e) {
            this.logger.error("fetchTxAndProcessEvent(): Error fetching transaction and processing event, signature: "+signature, e);
            return false;
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
            if(this.signaturesProcessing[signature]!=null) return;
            if(this.isSignatureProcessed(signature)) return;

            this.logger.debug("getWsEventHandler("+name+"): Process signature: ", signature);

            this.signaturesProcessing[signature] = this.processEvent({
                events: [{name, data: data as any}],
                blockTime: Math.floor(Date.now()/1000),
                signature
            }).then(() => true).catch(e => {
                this.logger.error("getWsEventHandler("+name+"): Error processing signature: "+signature, e);
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
    private async getNewSignatures(lastProcessedSignature: {signature: string, slot: number}): Promise<ConfirmedSignatureInfo[] | null> {
        let signatures: ConfirmedSignatureInfo[] = [];

        let fetched = null;
        while(fetched==null || fetched.length===this.logFetchLimit) {
            if(signatures.length===0) {
                fetched = await this.connection.getSignaturesForAddress(this.solanaSwapProgram.program.programId, {
                    until: lastProcessedSignature.signature,
                    limit: this.logFetchLimit
                }, "confirmed");
                //Check if newest returned signature (index 0) is older than the latest signature's slot, this is a sanity check
                if(fetched.length>0 && fetched[0].slot<lastProcessedSignature.slot) {
                    this.logger.debug("getNewSignatures(): Sanity check triggered, returned signature slot height is older than latest!");
                    return null;
                }
            } else {
                fetched = await this.connection.getSignaturesForAddress(this.solanaSwapProgram.program.programId, {
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
    private async getFirstSignature(): Promise<ConfirmedSignatureInfo[]> {
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
    private async processSignatures(signatures: ConfirmedSignatureInfo[]): Promise<{signature: string, slot: number} | null> {
        let lastSuccessfulSignature: {signature: string, slot: number} | null = null;

        try {
            for(let i=signatures.length-1;i>=0;i--) {
                const txSignature = signatures[i];

                //Check if signature is already being processed by the
                const signaturePromise = this.signaturesProcessing[txSignature.signature];
                if(signaturePromise!=null) {
                    const result = await signaturePromise;
                    delete this.signaturesProcessing[txSignature.signature];
                    if(result) {
                        lastSuccessfulSignature = txSignature;
                        this.addProcessedSignature(txSignature.signature);
                        continue;
                    }
                }

                this.logger.debug("processSignatures(): Process signature: ", txSignature);

                const processPromise: Promise<boolean> = this.fetchTxAndProcessEvent(txSignature.signature);
                this.signaturesProcessing[txSignature.signature] = processPromise;

                const result = await processPromise;
                if(!result) throw new Error("Failed to process signature: "+txSignature);
                lastSuccessfulSignature = txSignature;
                this.addProcessedSignature(txSignature.signature);
                delete this.signaturesProcessing[txSignature.signature];
            }
        } catch (e) {
            this.logger.error("processSignatures(): Failed processing signatures: ", e);
        }
        return lastSuccessfulSignature;
    }

    /**
     * Polls for new events & processes them
     *
     * @private
     */
    private async checkEvents() {
        const lastSignature = await this.getLastSignature();

        let signatures = lastSignature==null
            ? await this.getFirstSignature()
            : await this.getNewSignatures(lastSignature);
        if(signatures==null) return;

        let lastSuccessfulSignature = await this.processSignatures(signatures);

        if(lastSuccessfulSignature!=null) {
            await this.saveLastSignature(lastSuccessfulSignature.signature, lastSuccessfulSignature.slot);
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

    async init(): Promise<void> {
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
