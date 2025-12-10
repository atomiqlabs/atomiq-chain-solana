import {SolanaEvents} from "../../chain/modules/SolanaEvents";
import {BorshCoder, DecodeType, Event, EventParser, Idl, IdlTypes, Instruction} from "@coral-xyz/anchor";
import {IdlEvent, IdlField, IdlInstruction} from "@coral-xyz/anchor/dist/cjs/idl";
import {ConfirmedSignatureInfo, ParsedMessage, PartiallyDecodedInstruction, PublicKey} from "@solana/web3.js";
import {SolanaProgramBase} from "../SolanaProgramBase";
import {SolanaChainInterface} from "../../chain/SolanaChainInterface";

type DecodedFieldOrNull<D, Defined> = D extends IdlField ? DecodeType<D["type"], Defined> : unknown;
type ArgsTuple<A extends IdlField[], Defined> = {
    [K in A[number]["name"]]: DecodedFieldOrNull<Extract<A[number], { name: K }>, Defined>
};

export type InstructionWithAccounts<IDL extends Idl> = SingleInstructionWithAccounts<IDL["instructions"][number], IDL>;

export type SingleInstructionWithAccounts<I extends IdlInstruction, IDL extends Idl> = {
    name: I["name"],
    accounts: {
        [key in I["accounts"][number]["name"]]: PublicKey
    },
    data: ArgsTuple<I["args"], IdlTypes<IDL>>
};

export type ProgramEvent<IDL extends Idl> = Event<NonNullable<IDL["events"]>[number], Record<string, any>>;

export class SolanaProgramEvents<IDL extends Idl> extends SolanaEvents {

    private readonly programCoder: BorshCoder;
    private readonly eventParser: EventParser;
    private readonly program: SolanaProgramBase<IDL>;
    private readonly nameMappedInstructions: {[name: string]: IdlInstruction};

    constructor(chain: SolanaChainInterface, program: SolanaProgramBase<IDL>) {
        super(chain);
        this.program = program;
        this.programCoder = new BorshCoder(program.program.idl);
        this.eventParser = new EventParser(program.program.programId, this.programCoder);
        this.nameMappedInstructions = {};
        for(let ix of program.program.idl.instructions) {
            this.nameMappedInstructions[ix.name] = ix;
        }
    }

    /**
     * Gets events from specific transaction as specified by signature, events are ordered from newest to oldest
     *
     * @param signature
     * @private
     */
    private async getEvents(signature: string): Promise<ProgramEvent<IDL>[]> {
        const tx = await this.connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0
        });
        if(tx==null) throw new Error(`Cannot get Solana transaction: ${signature}!`);
        if(tx.meta==null) throw new Error(`Cannot get Solana transaction: ${signature}, tx.meta is null!`);

        if(tx.meta.err || tx.meta.logMessages==null) return [];

        const events = this.parseLogs(tx.meta.logMessages);
        events.reverse();

        return events;
    }

    /**
     * Runs a search backwards in time, processing the events for a specific topic public key
     *
     * @param topicKey
     * @param processor called for every event, should return a value if the correct event was found, or null
     *  if the search should continue
     * @param abortSignal
     * @param logBatchSize how many signatures should be fetched in one getSignaturesForAddress call
     */
    public findInEvents<T>(
        topicKey: PublicKey,
        processor: (event: ProgramEvent<IDL>, info: ConfirmedSignatureInfo) => Promise<T | null | undefined>,
        abortSignal?: AbortSignal,
        logBatchSize?: number
    ): Promise<T | null> {
        return this.findInSignatures<T>(topicKey, async (signatures: ConfirmedSignatureInfo[]) => {
            for(let data of signatures) {
                for(let event of await this.getEvents(data.signature)) {
                    if(abortSignal!=null) abortSignal.throwIfAborted();
                    const result = await processor(event, data);
                    if(result!=null) return result;
                }
            }
            return null;
        }, abortSignal, logBatchSize);
    }

    /**
     * Decodes the instructions for this program from the transaction, leaves null in the returned instructions array
     *  for every instruction that doesn't correspond to this program (as those are impossible to parse)
     *
     * @param transactionMessage
     */
    public decodeInstructions(transactionMessage: ParsedMessage): (InstructionWithAccounts<IDL> | null)[] {
        const instructions: (InstructionWithAccounts<IDL> | null)[] = [];

        for(let _ix of transactionMessage.instructions) {
            if(!_ix.programId.equals(this.program.program.programId)) {
                instructions.push(null);
                continue;
            }

            const ix: PartiallyDecodedInstruction = _ix as PartiallyDecodedInstruction;
            if(ix.data==null) continue;

            const parsedIx: Instruction | null = this.programCoder.instruction.decode(ix.data, 'base58');
            if(parsedIx==null) throw new Error(`Failed to decode transaction instruction: ${ix.data}!`);
            const accountsData = this.nameMappedInstructions[parsedIx.name];
            let accounts: {[name: string]: PublicKey} | null = null;
            if(accountsData!=null && accountsData.accounts!=null) {
                accounts = {};
                for(let i=0;i<accountsData.accounts.length;i++) {
                    accounts[accountsData.accounts[i].name] = ix.accounts[i];
                }
            }
            instructions.push({
                name: parsedIx.name,
                data: parsedIx.data as any,
                accounts: accounts as any
            });
        }

        return instructions;
    }

    /**
     * Parses program event related to this program from transaction logs
     *
     * @param logs
     */
    public parseLogs(logs: string[]): ProgramEvent<IDL>[] {
        const eventsGenerator = this.eventParser.parseLogs(logs);

        const events: ProgramEvent<IDL>[] = [];
        for(let log of eventsGenerator) {
            events.push(log as ProgramEvent<IDL>);
        }

        return events;
    }

}