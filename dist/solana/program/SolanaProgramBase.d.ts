/// <reference types="node" />
import { Idl, Program } from "@coral-xyz/anchor";
import { SolanaFees } from "../base/modules/SolanaFees";
import { SolanaBase, SolanaRetryPolicy } from "../base/SolanaBase";
import { SolanaProgramEvents } from "./modules/SolanaProgramEvents";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
/**
 * Base class providing program specific utilities
 */
export declare class SolanaProgramBase<T extends Idl> extends SolanaBase {
    program: Program<T>;
    readonly Events: SolanaProgramEvents<T>;
    constructor(connection: Connection, programIdl: any, programAddress?: string, retryPolicy?: SolanaRetryPolicy, solanaFeeEstimator?: SolanaFees);
    /**
     * Derives static PDA address from the seed
     *
     * @param seed
     */
    pda(seed: string): PublicKey;
    /**
     * Returns a function for deriving a dynamic PDA address from seed + dynamic arguments
     *
     * @param seed
     * @param func function translating the function argument to Buffer[]
     */
    pda<T extends Array<any>>(seed: string, func: (...args: T) => Buffer[]): (...args: T) => PublicKey;
    /**
     * Returns a function for deriving a dynamic deterministic keypair from dynamic arguments
     *
     * @param func function translating the function argument to Buffer[] to be used for deriving the keypair
     */
    keypair<T extends Array<any>>(func: (...args: T) => Buffer[]): (...args: T) => Keypair;
}
