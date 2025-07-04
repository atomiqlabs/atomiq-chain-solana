"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBigInt = exports.toBN = exports.toEscrowHash = exports.fromClaimHash = exports.toClaimHash = exports.SolanaTxUtils = exports.tryWithRetries = exports.getLogger = exports.onceAsync = exports.timeoutPromise = void 0;
const web3_js_1 = require("@solana/web3.js");
const BN = require("bn.js");
const buffer_1 = require("buffer");
const sha2_1 = require("@noble/hashes/sha2");
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
        debug: (msg, ...args) => global.atomiqLogLevel >= 3 && console.debug(prefix + msg, ...args),
        info: (msg, ...args) => global.atomiqLogLevel >= 2 && console.info(prefix + msg, ...args),
        warn: (msg, ...args) => (global.atomiqLogLevel == null || global.atomiqLogLevel >= 1) && console.warn(prefix + msg, ...args),
        error: (msg, ...args) => (global.atomiqLogLevel == null || global.atomiqLogLevel >= 0) && console.error(prefix + msg, ...args)
    };
}
exports.getLogger = getLogger;
const logger = getLogger("Utils: ");
async function tryWithRetries(func, retryPolicy, errorAllowed, abortSignal) {
    retryPolicy = retryPolicy || {};
    retryPolicy.maxRetries = retryPolicy.maxRetries || 5;
    retryPolicy.delay = retryPolicy.delay || 500;
    retryPolicy.exponential = retryPolicy.exponential == null ? true : retryPolicy.exponential;
    let err = null;
    for (let i = 0; i < retryPolicy.maxRetries; i++) {
        try {
            const resp = await func();
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
            await timeoutPromise(retryPolicy.exponential ? retryPolicy.delay * Math.pow(2, i) : retryPolicy.delay, abortSignal);
        }
    }
    throw err;
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
function toClaimHash(paymentHash, nonce, confirmations) {
    return paymentHash +
        nonce.toString(16).padStart(16, "0") +
        confirmations.toString(16).padStart(4, "0");
}
exports.toClaimHash = toClaimHash;
function fromClaimHash(claimHash) {
    if (claimHash.length !== 84)
        throw new Error("Claim hash invalid length: " + claimHash.length);
    return {
        paymentHash: claimHash.slice(0, 64),
        nonce: new BN(claimHash.slice(64, 80), "hex"),
        confirmations: parseInt(claimHash.slice(80, 84), 16)
    };
}
exports.fromClaimHash = fromClaimHash;
function toEscrowHash(paymentHash, sequence) {
    return buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.concat([
        buffer_1.Buffer.from(paymentHash, "hex"),
        sequence.toArrayLike(buffer_1.Buffer, "be", 8)
    ]))).toString("hex");
}
exports.toEscrowHash = toEscrowHash;
function toBN(value) {
    if (value == null)
        return null;
    return new BN(value.toString(10));
}
exports.toBN = toBN;
function toBigInt(value) {
    if (value == null)
        return null;
    return BigInt(value.toString(10));
}
exports.toBigInt = toBigInt;
