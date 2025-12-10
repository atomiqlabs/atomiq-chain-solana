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
     * Gets events from specific transaction as specified by signature, events are ordered from newest to oldest
     *
     * @param signature
     * @private
     */
    async getEvents(signature) {
        const tx = await this.connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0
        });
        if (tx == null)
            throw new Error(`Cannot get Solana transaction: ${signature}!`);
        if (tx.meta == null)
            throw new Error(`Cannot get Solana transaction: ${signature}, tx.meta is null!`);
        if (tx.meta.err || tx.meta.logMessages == null)
            return [];
        const events = this.parseLogs(tx.meta.logMessages);
        events.reverse();
        return events;
    }
    /**
     * Runs a search backwards in time, processing the events for a specific topic public key
     *
     * @param topicKey
     * @param processor called for every event, should return a value if the correct event was found, or null
     *  if the search should continue
     * @param abortSignal
     * @param logBatchSize how many signatures should be fetched in one getSignaturesForAddress call
     */
    findInEvents(topicKey, processor, abortSignal, logBatchSize) {
        return this.findInSignatures(topicKey, async (signatures) => {
            for (let data of signatures) {
                for (let event of await this.getEvents(data.signature)) {
                    if (abortSignal != null)
                        abortSignal.throwIfAborted();
                    const result = await processor(event, data);
                    if (result != null)
                        return result;
                }
            }
            return null;
        }, abortSignal, logBatchSize);
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
            if (parsedIx == null)
                throw new Error(`Failed to decode transaction instruction: ${ix.data}!`);
            const accountsData = this.nameMappedInstructions[parsedIx.name];
            let accounts = null;
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
