import {SolanaModule} from "../SolanaModule";
import {ConfirmedSignatureInfo, ParsedTransactionWithMeta, PublicKey} from "@solana/web3.js";
import {sign} from "tweetnacl";
import {ProgramEvent} from "../../program/modules/SolanaProgramEvents";
import {tryWithRetries} from "../../../utils/Utils";

export class SolanaEvents extends SolanaModule {

    public readonly LOG_FETCH_LIMIT = 500;

    private usingHeliusTFA: "yes" | "no" | "auto" = "auto";

    /**
     * Gets the signatures for a given topicKey public key, if lastProcessedSignature is specified, it fetches only
     *  the signatures before this signature
     *
     * @param topicKey
     * @param logFetchLimit
     * @param lastProcessedSignature
     * @private
     */
    private getSignatures(topicKey: PublicKey, logFetchLimit: number, lastProcessedSignature?: string): Promise<ConfirmedSignatureInfo[]> {
        if(lastProcessedSignature==null) {
            return this.connection.getSignaturesForAddress(topicKey, {
                limit: logFetchLimit,
            }, "confirmed");
        } else {
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
    async getTransactionsForAddress(
      account: PublicKey,
      options?: {
          paginationToken?: string,
          filters?: {
              slot?: {gte?: number, lte?: number, gt?: number, lt?: number},
              blockTime?: {gte?: number, lte?: number, gt?: number, lt?: number, eq?: number},
              signature?: {gte?: number, lte?: number, gt?: number, lt?: number, eq?: number},
              status?: "succeeded" | "failed" | "any"
          }
      },
      commitment?: "finalized" | "confirmed" | "processed"
    ): Promise<{
        data: ParsedTransactionWithMeta[],
        paginationToken?: string
    } | null> {
        const limit = 100;

        //Try to use getPriorityFeeEstimate api of Helius
        const response = await (this.connection as any)._rpcRequest("getTransactionsForAddress", [
            account.toString(),
            {
                ...options,
                transactionDetails: "full",
                sortOrder: "desc",
                limit,
                commitment: commitment ?? "confirmed",
                encoding: "jsonParsed",
                maxSupportedTransactionVersion: 0
            }
        ]).catch((e: any) => {
            //Catching not supported errors
            if(e.message!=null && (e.message.includes("-32601") || e.message.includes("-32600") || e.message.includes("-32403"))) {
                return {
                    error: {
                        code: -32601,
                        message: e.message
                    }
                };
            }
            throw e;
        });

        if(response.error!=null) {
            //Catching not supported errors
            if(response.error.code!==-32601 && response.error.code!==-32600 && response.error.code!==-32403) throw new Error(response.error.message);
            return null;
        }

        return {
            data: response.result.data.map((val: any) => {
                return {
                    ...val, //slot, blockTime, version
                    meta: val.meta==null ? undefined : {
                        //ParsedTransactionMeta
                        ...val.meta,
                        innerInstructions: val.meta.innerInstructions==null ? undefined : val.meta.innerInstructions.map((innerIx: any) => ({
                            //ParsedInnerInstruction
                            ...innerIx, //index
                            instructions: innerIx.instructions.map((ix: any) => {
                                if(ix.program!=null && ix.programId!=null) {
                                    return {
                                        //ParsedInstruction
                                        ...ix,
                                        programId: new PublicKey(ix.programId)
                                    }
                                } else {
                                    return {
                                        //PartiallyDecodedInstruction
                                        data: ix.data,
                                        programId: new PublicKey(ix.programId),
                                        accounts: ix.accounts.map((pubkey: string) => new PublicKey(pubkey))
                                    }
                                }
                            })
                        })),
                        loadedAddresses: val.meta.loadedAddresses==null ? undefined : {
                            writable: val.meta.loadedAddresses.writable.map((pubkey: string) => new PublicKey(pubkey)),
                            readonly: val.meta.loadedAddresses.readonly.map((pubkey: string) => new PublicKey(pubkey)),
                        }
                    },
                    transaction: {
                        //ParsedTransaction
                        ...val.transaction, //signatures
                        message: {
                            //ParsedMessage
                            ...val.transaction.message, //recentBlockhash
                            accountKeys: val.transaction.message.accountKeys.map((accountKey: any) => ({
                                //ParsedMessageAccount
                                ...accountKey,
                                pubkey: new PublicKey(accountKey.pubkey)
                            })),
                            instructions: val.transaction.message.instructions.map((ix: any) => {
                                if(ix.program!=null && ix.programId!=null) {
                                    return {
                                        //ParsedInstruction
                                        ...ix,
                                        programId: new PublicKey(ix.programId)
                                    }
                                } else {
                                    return {
                                        //PartiallyDecodedInstruction
                                        data: ix.data,
                                        programId: new PublicKey(ix.programId),
                                        accounts: ix.accounts.map((pubkey: string) => new PublicKey(pubkey))
                                    }
                                }
                            }),
                            addressTableLookups: val.transaction.message.addressTableLookups==null
                                ? undefined
                                : val.transaction.message.addressTableLookups.map((addressTableLookup: any) => ({
                                    //ParsedAddressTableLookup
                                    ...addressTableLookup,
                                    accountKey: new PublicKey(addressTableLookup.accountKey)
                                }))
                        }
                    }
                }
            }),
            paginationToken: response.result.paginationToken
        };
    }

    private async _findInTxsTFA<T>(
      topicKey: PublicKey,
      processor: (data: {signatures?: ConfirmedSignatureInfo[], txs?: ParsedTransactionWithMeta[]}) => Promise<T>,
      abortSignal?: AbortSignal,
      startBlockheight?: number
    ): Promise<T | undefined | null> {
        let paginationToken: string | undefined;
        let txs: ParsedTransactionWithMeta[] | undefined;
        while(txs==null || txs.length>0) {
            let filters = startBlockheight!=null ? {
                slot: {gte: startBlockheight}
            } : {};
            const tfaResult = await tryWithRetries(
                () => this.getTransactionsForAddress(topicKey, {
                    paginationToken,
                    filters: {
                        ...filters,
                        status: "succeeded"
                    }
                }, "confirmed"),
                undefined, undefined, abortSignal
            );

            if(tfaResult==null) {
                //Not supported
                return undefined;
            }

            txs = tfaResult.data;
            paginationToken = tfaResult.paginationToken;

            if(txs.length===0) {
                this.logger.debug(`_findInTxsTFA(): Got ${txs.length} txns (empty response), paginationToken: ${paginationToken}`);
            } else {
                this.logger.debug(`_findInTxsTFA(): Got ${txs.length} txns (${txs[0].transaction.signatures[0]}..${txs[txs.length-1].transaction.signatures[0]}), paginationToken: ${paginationToken}`);
            }

            if(abortSignal!=null) abortSignal.throwIfAborted();
            const result: T = await processor({txs});
            if(result!=null) return result;
            if(paginationToken==null) break;
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
    private async _findInSignatures<T>(
        topicKey: PublicKey,
        processor: (data: {signatures?: ConfirmedSignatureInfo[], txs?: ParsedTransactionWithMeta[]}) => Promise<T | null | undefined>,
        abortSignal?: AbortSignal,
        logFetchLimit?: number,
        startBlockheight?: number
    ): Promise<T | null> {
        if(logFetchLimit==null || logFetchLimit>this.LOG_FETCH_LIMIT) logFetchLimit = this.LOG_FETCH_LIMIT;
        let signatures: ConfirmedSignatureInfo[] | undefined;
        do {
            signatures = await this.getSignatures(topicKey, logFetchLimit, signatures!=null ? signatures?.[signatures.length-1].signature : undefined);
            if(startBlockheight!=null) {
                const endIndex = signatures.findIndex(val => val.slot < startBlockheight);
                if(endIndex===0) return null;
                if(endIndex!==-1) signatures = signatures.slice(0, endIndex - 1);
            }

            if(signatures.length===0) {
                this.logger.debug(`_findInSignatures(): Got ${signatures.length} txns (empty response)`);
            } else {
                this.logger.debug(`_findInSignatures(): Got ${signatures.length} txns (${signatures[0].signature}..${signatures[signatures.length-1].signature})`);
            }

            if(abortSignal!=null) abortSignal.throwIfAborted();
            const result = await processor({signatures});
            if(result!=null) return result;
        } while(signatures.length>=logFetchLimit); //Only fetch next one if this response is full
        return null;
    }

    public async findInSignatures<T>(
        topicKey: PublicKey,
        processor: (data: {signatures?: ConfirmedSignatureInfo[], txs?: ParsedTransactionWithMeta[]}) => Promise<T | undefined | null>,
        abortSignal?: AbortSignal,
        logFetchLimit?: number,
        startBlockheight?: number
    ): Promise<T | null> {
        if(this.usingHeliusTFA!=="no") {
            //Attempt to use Helius's gTFA
            const result = await this._findInTxsTFA(topicKey, processor, abortSignal, startBlockheight);
            if(result!==undefined) return result;

            //Not supported
            if(this.usingHeliusTFA==="yes") throw new Error("Helius gTFA is not supported with current provider!");
            //If set to auto, we can manually set to "no"
            this.usingHeliusTFA = "no";
            this.logger.warn("findInSignatures(): Helius gTFA is not supported, switching back to using gSFA!")
        }
        return await this._findInSignatures(topicKey, processor, abortSignal, logFetchLimit, startBlockheight);
    }

}