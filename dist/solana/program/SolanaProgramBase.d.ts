/// <reference types="node" />
import { Idl, Program } from "@coral-xyz/anchor";
import { SolanaChainInterface } from "../chain/SolanaChainInterface";
import { SolanaProgramEvents } from "./modules/SolanaProgramEvents";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
/**
 * Base class providing program specific utilities
 */
export declare class SolanaProgramBase<T extends Idl> {
    protected readonly logger: {
        debug: (msg: string, ...args: any[]) => false | void; /**
         * Derives static PDA address from the seed
         *
         * @param seed
         */
        info: (msg: string, ...args: any[]) => false | void;
        warn: (msg: string, ...args: any[]) => false | void;
        error: (msg: string, ...args: any[]) => false | void;
    };
    program: Program<T>;
    readonly Events: SolanaProgramEvents<T>;
    readonly Chain: SolanaChainInterface;
    constructor(chainInterface: SolanaChainInterface, programIdl: any, programAddress?: string);
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
