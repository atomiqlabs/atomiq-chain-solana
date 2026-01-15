import {SolanaEvents} from "../../chain/modules/SolanaEvents";
import {BorshCoder, DecodeType, Event, EventParser, Idl, IdlTypes, Instruction} from "@coral-xyz/anchor";
import {IdlField, IdlInstruction} from "@coral-xyz/anchor/dist/cjs/idl";
import {
    ConfirmedSignatureInfo,
    ParsedMessage, ParsedTransactionWithMeta,
    PartiallyDecodedInstruction,
    PublicKey,
    VersionedTransaction, VersionedTransactionResponse
} from "@solana/web3.js";
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

export type ProgramEvent<IDL extends Idl> = Event<IDL["events"][number], Record<string, any>>;

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
     * Runs a search backwards in time, processing the events for a specific topic public key
     *
     * @param topicKey
     * @param processor called for every event, should return a value if the correct event was found, or null
     *  if the search should continue
     * @param abortSignal
     * @param logBatchSize how many signatures should be fetched in one getSignaturesForAddress call
     * @param startBlockheight
     */
    public findInEvents<T>(
        topicKey: PublicKey,
        processor: (event: ProgramEvent<IDL>, tx: ParsedTransactionWithMeta) => Promise<T>,
        abortSignal?: AbortSignal,
        logBatchSize?: number,
        startBlockheight?: number
    ): Promise<T> {
        return this.findInSignatures<T>(topicKey, async (data: {signatures?: ConfirmedSignatureInfo[], txs?: ParsedTransactionWithMeta[]}) => {
            if(data.signatures) {
                for(let info of data.signatures) {
                    if(info.err) continue;

                    const tx = await this.connection.getParsedTransaction(info.signature, {
                        commitment: "confirmed",
                        maxSupportedTransactionVersion: 0
                    });
                    if(tx.meta.err) continue;

                    const events = this.parseLogs(tx.meta.logMessages);
                    events.reverse();

                    for(let event of events) {
                        if(abortSignal!=null) abortSignal.throwIfAborted();
                        const result: T = await processor(event, tx);
                        if(result!=null) return result;
                    }
                }
            } else {
                for(let tx of data.txs) {
                    if(tx.meta.err) continue;

                    const events = this.parseLogs(tx.meta.logMessages);
                    events.reverse();

                    for(let event of events) {
                        if(abortSignal!=null) abortSignal.throwIfAborted();
                        const result: T = await processor(event, tx);
                        if(result!=null) return result;
                    }
                }
            }
        }, abortSignal, logBatchSize, startBlockheight);
    }

    /**
     * Decodes the instructions for this program from the transaction, leaves null in the returned instructions array
     *  for every instruction that doesn't correspond to this program (as those are impossible to parse)
     *
     * @param transactionMessage
     */
    public decodeInstructions(transactionMessage: ParsedMessage): InstructionWithAccounts<IDL>[] {
        const instructions: InstructionWithAccounts<IDL>[] = [];

        for(let _ix of transactionMessage.instructions) {
            if(!_ix.programId.equals(this.program.program.programId)) {
                instructions.push(null);
                continue;
            }

            const ix: PartiallyDecodedInstruction = _ix as PartiallyDecodedInstruction;
            if(ix.data==null) continue;

            const parsedIx: Instruction = this.programCoder.instruction.decode(ix.data, 'base58');
            const accountsData = this.nameMappedInstructions[parsedIx.name];
            let accounts: {[name: string]: PublicKey};
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