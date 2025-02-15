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
exports.SolanaTxUtils = exports.tryWithRetries = exports.getLogger = exports.onceAsync = exports.timeoutPromise = void 0;
const web3_js_1 = require("@solana/web3.js");
function timeoutPromise(timeoutMillis, abortSignal) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, timeoutMillis);
        if (abortSignal != null)
            abortSignal.addEventListener("abort", () => {
                clearTimeout(timeout);
                reject(new Error("Aborted"));
            });
    });
}
exports.timeoutPromise = timeoutPromise;
function onceAsync(executor) {
    let promise;
    return () => {
        if (promise == null) {
            promise = executor();
            return promise;
        }
        else {
            return promise.catch(() => promise = executor());
        }
    };
}
exports.onceAsync = onceAsync;
function getLogger(prefix) {
    return {
        debug: (msg, ...args) => console.debug(prefix + msg, ...args),
        info: (msg, ...args) => console.info(prefix + msg, ...args),
        warn: (msg, ...args) => console.warn(prefix + msg, ...args),
        error: (msg, ...args) => console.error(prefix + msg, ...args)
    };
}
exports.getLogger = getLogger;
const logger = getLogger("Utils: ");
function tryWithRetries(func, retryPolicy, errorAllowed, abortSignal) {
    return __awaiter(this, void 0, void 0, function* () {
        retryPolicy = retryPolicy || {};
        retryPolicy.maxRetries = retryPolicy.maxRetries || 5;
        retryPolicy.delay = retryPolicy.delay || 500;
        retryPolicy.exponential = retryPolicy.exponential == null ? true : retryPolicy.exponential;
        let err = null;
        for (let i = 0; i < retryPolicy.maxRetries; i++) {
            try {
                const resp = yield func();
                return resp;
            }
            catch (e) {
                if (errorAllowed != null && errorAllowed(e))
                    throw e;
                err = e;
                logger.error("tryWithRetries(): error on try number: " + i, e);
            }
            if (abortSignal != null && abortSignal.aborted)
                throw new Error("Aborted");
            if (i !== retryPolicy.maxRetries - 1) {
                yield timeoutPromise(retryPolicy.exponential ? retryPolicy.delay * Math.pow(2, i) : retryPolicy.delay, abortSignal);
            }
        }
        throw err;
    });
}
exports.tryWithRetries = tryWithRetries;
class SolanaTxUtils {
    /**
     * Compact u16 array header size
     * @param n elements in the compact array
     * @returns size in bytes of array header
     */
    static compactHeader(n) {
        return (n <= SolanaTxUtils.LOW_VALUE ? 1 : n <= SolanaTxUtils.HIGH_VALUE ? 2 : 3);
    }
    /**
     * Compact u16 array size
     * @param n elements in the compact array
     * @param size bytes per each element
     * @returns size in bytes of array
     */
    static compactArraySize(n, size) {
        return SolanaTxUtils.compactHeader(n) + n * size;
    }
    /**
     * Returns # number of non-compute budget related instructions
     *
     * @param tx
     */
    static getNonComputeBudgetIxs(tx) {
        let counter = 0;
        for (let ix of tx.instructions) {
            if (!ix.programId.equals(web3_js_1.ComputeBudgetProgram.programId))
                counter++;
        }
        return counter;
    }
    /**
     * @param tx a solana transaction
     * @param feePayer the publicKey of the signer
     * @returns size in bytes of the transaction
     */
    static getTxSize(tx, feePayer) {
        const feePayerPk = [feePayer.toBase58()];
        const signers = new Set(feePayerPk);
        const accounts = new Set(feePayerPk);
        const ixsSize = tx.instructions.reduce((acc, ix) => {
            ix.keys.forEach(({ pubkey, isSigner }) => {
                const pk = pubkey.toBase58();
                if (isSigner)
                    signers.add(pk);
                accounts.add(pk);
            });
            accounts.add(ix.programId.toBase58());
            const nIndexes = ix.keys.length;
            const opaqueData = ix.data.length;
            return (acc +
                1 + // PID index
                SolanaTxUtils.compactArraySize(nIndexes, 1) +
                SolanaTxUtils.compactArraySize(opaqueData, 1));
        }, 0);
        return (SolanaTxUtils.compactArraySize(signers.size, 64) + // signatures
            3 + // header
            SolanaTxUtils.compactArraySize(accounts.size, 32) + // accounts
            32 + // blockhash
            SolanaTxUtils.compactHeader(tx.instructions.length) + // instructions
            ixsSize);
    }
    ;
}
exports.SolanaTxUtils = SolanaTxUtils;
// COMPACT ARRAY
SolanaTxUtils.LOW_VALUE = 127; // 0x7f
SolanaTxUtils.HIGH_VALUE = 16383; // 0x3fff
