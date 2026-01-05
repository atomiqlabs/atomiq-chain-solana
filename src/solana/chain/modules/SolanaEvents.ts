import {SolanaModule} from "../SolanaModule";
import {ConfirmedSignatureInfo, ParsedTransactionWithMeta, PublicKey} from "@solana/web3.js";
import {sign} from "tweetnacl";
import {ProgramEvent} from "../../program/modules/SolanaProgramEvents";

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
    }> {
        //Try to use getPriorityFeeEstimate api of Helius
        const response = await (this.connection as any)._rpcRequest("getTransactionsForAddress", [
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
            if(e.message!=null && (e.message.includes("-32601") || e.message.includes("-32600"))) {
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
            if(response.error.code!==-32601 && response.error.code!==-32600) throw new Error(response.error.message);
            return null;
        }

        return response.result;
    }

    private async _findInTxsTFA<T>(
      topicKey: PublicKey,
      processor: (data: {signatures?: ConfirmedSignatureInfo[], txs?: ParsedTransactionWithMeta[]}) => Promise<T>,
      abortSignal?: AbortSignal,
      startBlockheight?: number
    ): Promise<T> {
        let paginationToken: string;
        let txs: ParsedTransactionWithMeta[] = null;
        while(txs==null || txs.length>0) {
            let filters = startBlockheight!=null ? {
                slot: {gte: startBlockheight}
            } : {};
            const tfaResult = await this.getTransactionsForAddress(topicKey, {
                paginationToken,
                filters: {
                    ...filters,
                    status: "succeeded"
                }
            }, "confirmed");

            if(tfaResult==null) {
                //Not supported
                return undefined;
            }

            txs = tfaResult.data;
            paginationToken = tfaResult.paginationToken;

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
        processor: (data: {signatures?: ConfirmedSignatureInfo[], txs?: ParsedTransactionWithMeta[]}) => Promise<T>,
        abortSignal?: AbortSignal,
        logFetchLimit?: number,
        startBlockheight?: number
    ): Promise<T> {
        if(logFetchLimit==null || logFetchLimit>this.LOG_FETCH_LIMIT) logFetchLimit = this.LOG_FETCH_LIMIT;
        let signatures: ConfirmedSignatureInfo[] = null;
        while(signatures==null || signatures.length>0) {
            signatures = await this.getSignatures(topicKey, logFetchLimit, signatures!=null ? signatures[signatures.length-1].signature : null);
            if(startBlockheight!=null) {
                const endIndex = signatures.findIndex(val => val.slot < startBlockheight);
                if(endIndex===0) return null;
                if(endIndex!==-1) signatures = signatures.slice(0, endIndex - 1);
            }
            if(abortSignal!=null) abortSignal.throwIfAborted();
            const result: T = await processor({signatures});
            if(result!=null) return result;
            if(signatures.length<logFetchLimit) break;
        }
        return null;
    }

    public async findInSignatures<T>(
        topicKey: PublicKey,
        processor: (data: {signatures?: ConfirmedSignatureInfo[], txs?: ParsedTransactionWithMeta[]}) => Promise<T>,
        abortSignal?: AbortSignal,
        logFetchLimit?: number,
        startBlockheight?: number
    ) {
        if(this.usingHeliusTFA!=="no") {
            //Attempt to use Helius's gTFA
            const result = await this._findInTxsTFA(topicKey, processor, abortSignal, startBlockheight);
            if(result!==undefined) return result;

            //Not supported
            if(this.usingHeliusTFA==="yes") throw new Error("Helius gTFA is not supported with current provider!");
            //If set to auto, we can manually set to "no"
            this.usingHeliusTFA = "no";
        }
        return await this._findInSignatures(topicKey, processor, abortSignal, logFetchLimit, startBlockheight);
    }

}