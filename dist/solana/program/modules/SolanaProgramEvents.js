"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaProgramEvents = void 0;
const SolanaEvents_1 = require("../../chain/modules/SolanaEvents");
const anchor_1 = require("@coral-xyz/anchor");
class SolanaProgramEvents extends SolanaEvents_1.SolanaEvents {
    constructor(chain, program) {
        super(chain);
        this.program = program;
        this.programCoder = new anchor_1.BorshCoder(program.program.idl);
        this.eventParser = new anchor_1.EventParser(program.program.programId, this.programCoder);
        this.nameMappedInstructions = {};
        for (let ix of program.program.idl.instructions) {
            this.nameMappedInstructions[ix.name] = ix;
        }
    }
    /**
     * Runs a search backwards in time, processing the events for a specific topic public key
     *
     * @param topicKey
     * @param processor called for every event, should return a value if the correct event was found, or null
     *  if the search should continue
     * @param abortSignal
     * @param logBatchSize how many signatures should be fetched in one getSignaturesForAddress call
     * @param startBlockheight
     */
    findInEvents(topicKey, processor, abortSignal, logBatchSize, startBlockheight) {
        return this.findInSignatures(topicKey, async (data) => {
            if (data.signatures) {
                for (let info of data.signatures) {
                    if (info.err)
                        continue;
                    const tx = await this.connection.getParsedTransaction(info.signature, {
                        commitment: "confirmed",
                        maxSupportedTransactionVersion: 0
                    });
                    if (tx.meta.err)
                        continue;
                    const events = this.parseLogs(tx.meta.logMessages);
                    events.reverse();
                    for (let event of events) {
                        if (abortSignal != null)
                            abortSignal.throwIfAborted();
                        const result = await processor(event, tx);
                        if (result != null)
                            return result;
                    }
                }
            }
            else {
                for (let tx of data.txs) {
                    if (tx.meta.err)
                        continue;
                    const events = this.parseLogs(tx.meta.logMessages);
                    events.reverse();
                    for (let event of events) {
                        if (abortSignal != null)
                            abortSignal.throwIfAborted();
                        const result = await processor(event, tx);
                        if (result != null)
                            return result;
                    }
                }
            }
        }, abortSignal, logBatchSize, startBlockheight);
    }
    /**
     * Decodes the instructions for this program from the transaction, leaves null in the returned instructions array
     *  for every instruction that doesn't correspond to this program (as those are impossible to parse)
     *
     * @param transactionMessage
     */
    decodeInstructions(transactionMessage) {
        const instructions = [];
        for (let _ix of transactionMessage.instructions) {
            if (!_ix.programId.equals(this.program.program.programId)) {
                instructions.push(null);
                continue;
            }
            const ix = _ix;
            if (ix.data == null)
                continue;
            const parsedIx = this.programCoder.instruction.decode(ix.data, 'base58');
            const accountsData = this.nameMappedInstructions[parsedIx.name];
            let accounts;
            if (accountsData != null && accountsData.accounts != null) {
                accounts = {};
                for (let i = 0; i < accountsData.accounts.length; i++) {
                    accounts[accountsData.accounts[i].name] = ix.accounts[i];
                }
            }
            instructions.push({
                name: parsedIx.name,
                data: parsedIx.data,
                accounts: accounts
            });
        }
        return instructions;
    }
    /**
     * Parses program event related to this program from transaction logs
     *
     * @param logs
     */
    parseLogs(logs) {
        const eventsGenerator = this.eventParser.parseLogs(logs);
        const events = [];
        for (let log of eventsGenerator) {
            events.push(log);
        }
        return events;
    }
}
exports.SolanaProgramEvents = SolanaProgramEvents;
