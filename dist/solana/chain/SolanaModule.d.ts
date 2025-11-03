import { Connection } from "@solana/web3.js";
import { SolanaChainInterface, SolanaRetryPolicy } from "./SolanaChainInterface";
export declare class SolanaModule {
    protected readonly connection: Connection;
    protected readonly retryPolicy: SolanaRetryPolicy;
    protected readonly root: SolanaChainInterface;
    protected readonly logger: {
        debug: (msg: any, ...args: any[]) => false | void;
        info: (msg: any, ...args: any[]) => false | void;
        warn: (msg: any, ...args: any[]) => false | void;
        error: (msg: any, ...args: any[]) => false | void;
    };
    constructor(root: SolanaChainInterface);
}
