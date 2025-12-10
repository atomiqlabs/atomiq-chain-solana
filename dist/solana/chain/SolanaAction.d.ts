import { PublicKey, Signer, TransactionInstruction } from "@solana/web3.js";
import { SolanaTx } from "./modules/SolanaTransactions";
import { SolanaChainInterface } from "./SolanaChainInterface";
export declare class SolanaAction {
    computeBudget: number | null;
    readonly mainSigner: PublicKey;
    private readonly root;
    private readonly instructions;
    private feeRate?;
    private readonly signers;
    private firstIxBeforeComputeBudget;
    constructor(mainSigner: PublicKey, root: SolanaChainInterface, instructions?: TransactionInstruction[] | TransactionInstruction, computeBudget?: number, feeRate?: string, signers?: Signer[], firstIxBeforeComputeBudget?: boolean);
    private estimateFee;
    addIx(instruction: TransactionInstruction, computeBudget?: number, signers?: Signer[]): void;
    add(action: SolanaAction): this;
    addAction(action: SolanaAction, index?: number): this;
    tx(feeRate?: string, block?: {
        blockhash: string;
        blockHeight: number;
    }): Promise<SolanaTx>;
    addToTxs(txs: SolanaTx[], feeRate?: string, block?: {
        blockhash: string;
        blockHeight: number;
    }): Promise<void>;
    ixsLength(): number;
}
