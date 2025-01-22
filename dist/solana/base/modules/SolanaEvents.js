"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaEvents = void 0;
const SolanaModule_1 = require("../SolanaModule");
class SolanaEvents extends SolanaModule_1.SolanaModule {
    constructor() {
        super(...arguments);
        this.LOG_FETCH_LIMIT = 500;
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
     * Runs a search backwards in time, processing transaction signatures for a specific topic public key
     *
     * @param topicKey
     * @param processor called for every batch of returned signatures, should return a value if the correct signature
     *  was found, or null if the search should continue
     * @param abortSignal
     * @param logFetchLimit
     */
    findInSignatures(topicKey, processor, abortSignal, logFetchLimit) {
        return __awaiter(this, void 0, void 0, function* () {
            if (logFetchLimit == null || logFetchLimit > this.LOG_FETCH_LIMIT)
                logFetchLimit = this.LOG_FETCH_LIMIT;
            let signatures = null;
            while (signatures == null || signatures.length > 0) {
                signatures = yield this.getSignatures(topicKey, logFetchLimit, signatures != null ? signatures[signatures.length - 1].signature : null);
                if (abortSignal != null)
                    abortSignal.throwIfAborted();
                const result = yield processor(signatures);
                if (result != null)
                    return result;
                if (signatures.length < logFetchLimit)
                    break;
            }
            return null;
        });
    }
}
exports.SolanaEvents = SolanaEvents;
