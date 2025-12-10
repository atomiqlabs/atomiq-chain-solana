import { SolanaEvents } from "../../chain/modules/SolanaEvents";
import { DecodeType, Event, Idl, IdlTypes } from "@coral-xyz/anchor";
import { IdlField, IdlInstruction } from "@coral-xyz/anchor/dist/cjs/idl";
import { ParsedMessage, ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";
import { SolanaProgramBase } from "../SolanaProgramBase";
import { SolanaChainInterface } from "../../chain/SolanaChainInterface";
type DecodedFieldOrNull<D, Defined> = D extends IdlField ? DecodeType<D["type"], Defined> : unknown;
type ArgsTuple<A extends IdlField[], Defined> = {
    [K in A[number]["name"]]: DecodedFieldOrNull<Extract<A[number], {
        name: K;
    }>, Defined>;
};
export type InstructionWithAccounts<IDL extends Idl> = SingleInstructionWithAccounts<IDL["instructions"][number], IDL>;
export type SingleInstructionWithAccounts<I extends IdlInstruction, IDL extends Idl> = {
    name: I["name"];
    accounts: {
        [key in I["accounts"][number]["name"]]: PublicKey;
    };
    data: ArgsTuple<I["args"], IdlTypes<IDL>>;
};
export type ProgramEvent<IDL extends Idl> = Event<NonNullable<IDL["events"]>[number], Record<string, any>>;
export declare class SolanaProgramEvents<IDL extends Idl> extends SolanaEvents {
    private readonly programCoder;
    private readonly eventParser;
    private readonly program;
    private readonly nameMappedInstructions;
    constructor(chain: SolanaChainInterface, program: SolanaProgramBase<IDL>);
    /**
     * Runs a search backwards in time, processing the events for a specific topic public key
     *
     * @param topicKey
     * @param processor called for every event, should return a value if the correct event was found, or null
     *  if the search should continue
     * @param abortSignal
     * @param logBatchSize how many signatures should be fetched in one getSignaturesForAddress call
     * @param startBlockheight
     */
    findInEvents<T>(topicKey: PublicKey, processor: (event: ProgramEvent<IDL>, tx: ParsedTransactionWithMeta) => Promise<T | null | undefined>, abortSignal?: AbortSignal, logBatchSize?: number, startBlockheight?: number): Promise<T | null>;
    /**
     * Decodes the instructions for this program from the transaction, leaves null in the returned instructions array
     *  for every instruction that doesn't correspond to this program (as those are impossible to parse)
     *
     * @param transactionMessage
     */
    decodeInstructions(transactionMessage: ParsedMessage): (InstructionWithAccounts<IDL> | null)[];
    /**
     * Parses program event related to this program from transaction logs
     *
     * @param logs
     */
    parseLogs(logs: string[]): ProgramEvent<IDL>[];
}
export {};
