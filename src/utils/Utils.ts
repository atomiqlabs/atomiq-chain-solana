import {ComputeBudgetProgram, PublicKey, Transaction} from "@solana/web3.js";
import * as BN from "bn.js";
import {Buffer} from "buffer";
import {sha256} from "@noble/hashes/sha2";

export function timeoutPromise(timeoutMillis: number, abortSignal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, timeoutMillis)
        if(abortSignal!=null) abortSignal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new Error("Aborted"));
        })
    });
}

export function onceAsync<T>(executor: () => Promise<T>): () => Promise<T> {
    let promise: Promise<T>;

    return () => {
        if(promise==null) {
            promise = executor();
            return promise;
        } else {
            return promise.catch(() => promise = executor());
        }
    }
}

export function getLogger(prefix: string) {
    return {
        debug: (msg, ...args) => console.debug(prefix+msg, ...args),
        info: (msg, ...args) => console.info(prefix+msg, ...args),
        warn: (msg, ...args) => console.warn(prefix+msg, ...args),
        error: (msg, ...args) => console.error(prefix+msg, ...args)
    };
}

const logger = getLogger("Utils: ");

export async function tryWithRetries<T>(func: () => Promise<T>, retryPolicy?: {
    maxRetries?: number, delay?: number, exponential?: boolean
}, errorAllowed?: (e: any) => boolean, abortSignal?: AbortSignal): Promise<T> {
    retryPolicy = retryPolicy || {};
    retryPolicy.maxRetries = retryPolicy.maxRetries || 5;
    retryPolicy.delay = retryPolicy.delay || 500;
    retryPolicy.exponential =  retryPolicy.exponential==null ? true : retryPolicy.exponential;

    let err = null;

    for(let i=0;i<retryPolicy.maxRetries;i++) {
        try {
            const resp: T = await func();
            return resp;
        } catch (e) {
            if(errorAllowed!=null && errorAllowed(e)) throw e;
            err = e;
            logger.error("tryWithRetries(): error on try number: "+i, e);
        }
        if(abortSignal!=null && abortSignal.aborted) throw new Error("Aborted");
        if(i!==retryPolicy.maxRetries-1) {
            await timeoutPromise(
                retryPolicy.exponential ? retryPolicy.delay*Math.pow(2, i) : retryPolicy.delay,
                abortSignal
            );
        }
    }

    throw err;
}

export class SolanaTxUtils {
    // COMPACT ARRAY
    private static LOW_VALUE = 127; // 0x7f
    private static HIGH_VALUE = 16383; // 0x3fff

    /**
     * Compact u16 array header size
     * @param n elements in the compact array
     * @returns size in bytes of array header
     */
    private static compactHeader(n: number): number {
        return (n <= SolanaTxUtils.LOW_VALUE ? 1 : n <= SolanaTxUtils.HIGH_VALUE ? 2 : 3);
    }

    /**
     * Compact u16 array size
     * @param n elements in the compact array
     * @param size bytes per each element
     * @returns size in bytes of array
     */
    private static compactArraySize(n: number, size: number): number {
        return SolanaTxUtils.compactHeader(n) + n * size;
    }

    /**
     * Returns # number of non-compute budget related instructions
     *
     * @param tx
     */
    public static getNonComputeBudgetIxs(tx: Transaction): number {
        let counter = 0;
        for(let ix of tx.instructions) {
            if(!ix.programId.equals(ComputeBudgetProgram.programId)) counter++;
        }
        return counter;
    }

    /**
     * @param tx a solana transaction
     * @param feePayer the publicKey of the signer
     * @returns size in bytes of the transaction
     */
    public static getTxSize(tx: Transaction, feePayer: PublicKey): number {
        const feePayerPk = [feePayer.toBase58()];

        const signers = new Set<string>(feePayerPk);
        const accounts = new Set<string>(feePayerPk);

        const ixsSize = tx.instructions.reduce((acc, ix) => {
            ix.keys.forEach(({ pubkey, isSigner }) => {
                const pk = pubkey.toBase58();
                if (isSigner) signers.add(pk);
                accounts.add(pk);
            });

            accounts.add(ix.programId.toBase58());

            const nIndexes = ix.keys.length;
            const opaqueData = ix.data.length;

            return (
                acc +
                1 + // PID index
                SolanaTxUtils.compactArraySize(nIndexes, 1) +
                SolanaTxUtils.compactArraySize(opaqueData, 1)
            );
        }, 0);

        return (
            SolanaTxUtils.compactArraySize(signers.size, 64) + // signatures
            3 + // header
            SolanaTxUtils.compactArraySize(accounts.size, 32) + // accounts
            32 + // blockhash
            SolanaTxUtils.compactHeader(tx.instructions.length) + // instructions
            ixsSize
        );
    };
}

export function toClaimHash(paymentHash: string, nonce: bigint, confirmations: number): string {
    return paymentHash+
        nonce.toString(16).padStart(16, "0")+
        confirmations.toString(16).padStart(4, "0");
}

export function fromClaimHash(claimHash: string): {paymentHash: string, nonce: BN, confirmations: number} {
    if(claimHash.length!==84) throw new Error("Claim hash invalid length: "+claimHash.length);
    return {
        paymentHash: claimHash.slice(0, 64),
        nonce: new BN(claimHash.slice(64, 80), "hex"),
        confirmations: parseInt(claimHash.slice(80, 84), 16)
    }
}

export function toEscrowHash(paymentHash: string, sequence: BN): string {
    return Buffer.from(sha256(Buffer.concat([
        Buffer.from(paymentHash, "hex"),
        sequence.toArrayLike(Buffer, "be", 8)
    ]))).toString("hex");
}

export function toBN(value: bigint): BN {
    if(value==null) return null;
    return new BN(value.toString(10));
}

export function toBigInt(value: BN): bigint {
    if(value==null) return null;
    return BigInt(value.toString(10));
}
