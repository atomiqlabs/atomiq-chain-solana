"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaEvents = void 0;
const SolanaModule_1 = require("../SolanaModule");
const web3_js_1 = require("@solana/web3.js");
class SolanaEvents extends SolanaModule_1.SolanaModule {
    constructor() {
        super(...arguments);
        this.LOG_FETCH_LIMIT = 500;
        this.usingHeliusTFA = "auto";
    }
    /**
     * Gets the signatures for a given topicKey public key, if lastProcessedSignature is specified, it fetches only
     *  the signatures before this signature
     *
     * @param topicKey
     * @param logFetchLimit
     * @param lastProcessedSignature
     * @private
     */
    getSignatures(topicKey, logFetchLimit, lastProcessedSignature) {
        if (lastProcessedSignature == null) {
            return this.connection.getSignaturesForAddress(topicKey, {
                limit: logFetchLimit,
            }, "confirmed");
        }
        else {
            return this.connection.getSignaturesForAddress(topicKey, {
                before: lastProcessedSignature,
                limit: logFetchLimit
            }, "confirmed");
        }
    }
    /**
     * Implements Helius getTransactionsForAddress RPC API
     *
     * @param account
     * @param options
     * @param commitment
     */
    async getTransactionsForAddress(account, options, commitment) {
        //Try to use getPriorityFeeEstimate api of Helius
        const response = await this.connection._rpcRequest("getTransactionsForAddress", [
            account.toString(),
            {
                ...options,
                transactionDetails: "full",
                sortOrder: "desc",
                limit: 100,
                commitment: commitment ?? "confirmed",
                encoding: "jsonParsed",
                maxSupportedTransactionVersion: 0
            }
        ]).catch(e => {
            //Catching not supported errors
            if (e.message != null && (e.message.includes("-32601") || e.message.includes("-32600"))) {
                return {
                    error: {
                        code: -32601,
                        message: e.message
                    }
                };
            }
            throw e;
        });
        if (response.error != null) {
            //Catching not supported errors
            if (response.error.code !== -32601 && response.error.code !== -32600)
                throw new Error(response.error.message);
            return null;
        }
        return {
            data: response.result.data.map(val => {
                return {
                    ...val,
                    meta: val.meta == null ? undefined : {
                        //ParsedTransactionMeta
                        ...val.meta,
                        innerInstructions: val.meta.innerInstructions == null ? undefined : val.meta.innerInstructions.map(innerIx => ({
                            //ParsedInnerInstruction
                            ...innerIx,
                            instructions: innerIx.instructions.map(ix => {
                                if (ix.program != null && ix.programId != null) {
                                    return {
                                        //ParsedInstruction
                                        ...ix,
                                        programId: new web3_js_1.PublicKey(ix.programId)
                                    };
                                }
                                else {
                                    return {
                                        //PartiallyDecodedInstruction
                                        data: ix.data,
                                        programId: new web3_js_1.PublicKey(ix.programId),
                                        accounts: ix.accounts.map(pubkey => new web3_js_1.PublicKey(pubkey))
                                    };
                                }
                            })
                        })),
                        loadedAddresses: val.meta.loadedAddresses == null ? undefined : {
                            writable: val.meta.loadedAddresses.writable.map(pubkey => new web3_js_1.PublicKey(pubkey)),
                            readonly: val.meta.loadedAddresses.readonly.map(pubkey => new web3_js_1.PublicKey(pubkey)),
                        }
                    }
                };
            }),
            paginationToken: response.result.paginationToken
        };
    }
    async _findInTxsTFA(topicKey, processor, abortSignal, startBlockheight) {
        let paginationToken;
        let txs = null;
        while (txs == null || txs.length > 0) {
            let filters = startBlockheight != null ? {
                slot: { gte: startBlockheight }
            } : {};
            const tfaResult = await this.getTransactionsForAddress(topicKey, {
                paginationToken,
                filters: {
                    ...filters,
                    status: "succeeded"
                }
            }, "confirmed");
            if (tfaResult == null) {
                //Not supported
                return undefined;
            }
            txs = tfaResult.data;
            paginationToken = tfaResult.paginationToken;
            if (abortSignal != null)
                abortSignal.throwIfAborted();
            const result = await processor({ txs });
            if (result != null)
                return result;
            if (paginationToken == null)
                break;
        }
        return null;
    }
    /**
     * Runs a search backwards in time, processing transaction signatures for a specific topic public key
     *
     * @param topicKey
     * @param processor called for every batch of returned signatures, should return a value if the correct signature
     *  was found, or null if the search should continue
     * @param abortSignal
     * @param logFetchLimit
     * @param startBlockheight
     */
    async _findInSignatures(topicKey, processor, abortSignal, logFetchLimit, startBlockheight) {
        if (logFetchLimit == null || logFetchLimit > this.LOG_FETCH_LIMIT)
            logFetchLimit = this.LOG_FETCH_LIMIT;
        let signatures = null;
        while (signatures == null || signatures.length > 0) {
            signatures = await this.getSignatures(topicKey, logFetchLimit, signatures != null ? signatures[signatures.length - 1].signature : null);
            if (startBlockheight != null) {
                const endIndex = signatures.findIndex(val => val.slot < startBlockheight);
                if (endIndex === 0)
                    return null;
                if (endIndex !== -1)
                    signatures = signatures.slice(0, endIndex - 1);
            }
            if (abortSignal != null)
                abortSignal.throwIfAborted();
            const result = await processor({ signatures });
            if (result != null)
                return result;
            if (signatures.length < logFetchLimit)
                break;
        }
        return null;
    }
    async findInSignatures(topicKey, processor, abortSignal, logFetchLimit, startBlockheight) {
        if (this.usingHeliusTFA !== "no") {
            //Attempt to use Helius's gTFA
            const result = await this._findInTxsTFA(topicKey, processor, abortSignal, startBlockheight);
            if (result !== undefined)
                return result;
            //Not supported
            if (this.usingHeliusTFA === "yes")
                throw new Error("Helius gTFA is not supported with current provider!");
            //If set to auto, we can manually set to "no"
            this.usingHeliusTFA = "no";
        }
        return await this._findInSignatures(topicKey, processor, abortSignal, logFetchLimit, startBlockheight);
    }
}
exports.SolanaEvents = SolanaEvents;
