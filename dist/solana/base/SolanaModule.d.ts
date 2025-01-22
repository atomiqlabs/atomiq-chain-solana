import { Connection } from "@solana/web3.js";
import { SolanaBase, SolanaRetryPolicy } from "./SolanaBase";
export declare class SolanaModule {
    protected readonly connection: Connection;
    protected readonly retryPolicy: SolanaRetryPolicy;
    protected readonly root: SolanaBase;
    protected readonly logger: {
        debug: (msg: any, ...args: any[]) => void;
        info: (msg: any, ...args: any[]) => void;
        warn: (msg: any, ...args: any[]) => void;
        error: (msg: any, ...args: any[]) => void;
    };
    constructor(root: SolanaBase);
}
