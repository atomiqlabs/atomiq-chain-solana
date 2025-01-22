import { Connection } from "@solana/web3.js";
import { SolanaFees } from "./modules/SolanaFees";
import { SolanaBlocks } from "./modules/SolanaBlocks";
import { SolanaSlots } from "./modules/SolanaSlots";
import { SolanaTokens } from "./modules/SolanaTokens";
import { SolanaTransactions } from "./modules/SolanaTransactions";
import { SolanaAddresses } from "./modules/SolanaAddresses";
import { SolanaSignatures } from "./modules/SolanaSignatures";
import { SolanaEvents } from "./modules/SolanaEvents";
export type SolanaRetryPolicy = {
    maxRetries?: number;
    delay?: number;
    exponential?: boolean;
    transactionResendInterval?: number;
};
export declare class SolanaBase {
    readonly SLOT_TIME = 400;
    readonly TX_SLOT_VALIDITY = 151;
    readonly connection: Connection;
    readonly retryPolicy: SolanaRetryPolicy;
    readonly Blocks: SolanaBlocks;
    Fees: SolanaFees;
    readonly Slots: SolanaSlots;
    readonly Tokens: SolanaTokens;
    readonly Transactions: SolanaTransactions;
    readonly Addresses: SolanaAddresses;
    readonly Signatures: SolanaSignatures;
    readonly Events: SolanaEvents;
    protected readonly logger: {
        debug: (msg: any, ...args: any[]) => void;
        info: (msg: any, ...args: any[]) => void;
        warn: (msg: any, ...args: any[]) => void;
        error: (msg: any, ...args: any[]) => void;
    };
    constructor(connection: Connection, retryPolicy?: SolanaRetryPolicy, solanaFeeEstimator?: SolanaFees);
}
