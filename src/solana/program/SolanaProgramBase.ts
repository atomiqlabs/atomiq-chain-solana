import {AnchorProvider, Idl, Program} from "@coral-xyz/anchor";
import {SolanaFees} from "../chain/modules/SolanaFees";
import {SolanaChainInterface, SolanaRetryPolicy} from "../chain/SolanaChainInterface";
import {SolanaProgramEvents} from "./modules/SolanaProgramEvents";
import {Connection, Keypair, PublicKey} from "@solana/web3.js";
import {sha256} from "@noble/hashes/sha2";
import {Buffer} from "buffer";
import {SolanaKeypairWallet} from "../wallet/SolanaKeypairWallet";
import {getLogger} from "../../utils/Utils";

/**
 * Base class providing program specific utilities
 */
export class SolanaProgramBase<T extends Idl> {

    /**
     * @internal
     */
    protected readonly logger = getLogger(this.constructor.name+": ");

    program: Program<T>;

    /**
     * @internal
     */
    readonly _Events: SolanaProgramEvents<T>;
    /**
     * @internal
     */
    readonly _Chain: SolanaChainInterface;

    constructor(
        chainInterface: SolanaChainInterface,
        programIdl: any,
        programAddress?: string
    ) {
        this._Chain = chainInterface;

        this.program = new Program<T>(
            programIdl as any,
            programAddress || programIdl.metadata.address,
            new AnchorProvider(chainInterface._connection, new SolanaKeypairWallet(Keypair.generate()), {})
        );

        this._Events = new SolanaProgramEvents(chainInterface, this);
    }

    /**
     * Derives static PDA address from the seed
     *
     * @param seed
     *
     * @internal
     */
    protected pda(seed: string): PublicKey;
    /**
     * Returns a function for deriving a dynamic PDA address from seed + dynamic arguments
     *
     * @param seed
     * @param func function translating the function argument to Buffer[]
     *
     * @internal
     */
    protected pda<T extends Array<any>>(seed: string, func: (...args: T) => Buffer[]): (...args: T) => PublicKey;
    protected pda<T extends Array<any>>(seed: string, func?: (...args: T) => Buffer[]): PublicKey | ((...args: T) => PublicKey) {
        if(func==null) {
            return PublicKey.findProgramAddressSync(
                [Buffer.from(seed)],
                this.program.programId
            )[0];
        }
        return (...args: T) => {
            const res = func(...args);
            return PublicKey.findProgramAddressSync(
                [Buffer.from(seed)].concat(res as Buffer<ArrayBuffer>[]),
                this.program.programId
            )[0]
        }
    }
    /**
     * Returns a function for deriving a dynamic deterministic keypair from dynamic arguments
     *
     * @param func function translating the function argument to Buffer[] to be used for deriving the keypair
     *
     * @internal
     */
    _keypair<T extends Array<any>>(func: (...args: T) => Buffer[]): (...args: T) => Keypair {
        return (...args: T) => {
            const res = func(...args);
            const buff = sha256(Buffer.concat(res));
            return Keypair.fromSeed(buff);
        }
    }

}