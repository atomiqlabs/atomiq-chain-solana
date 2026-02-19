import { Commitment, Connection, ConnectionConfig } from "@solana/web3.js";
export type ConnectionWithRetriesConfig = ConnectionConfig & {
    retryPolicy?: {
        maxRetries?: number;
        delay?: number;
        exponential?: boolean;
    };
    requestTimeout?: number;
};
export declare class ConnectionWithRetries extends Connection {
    readonly retryPolicy?: {
        maxRetries?: number;
        delay?: number;
        exponential?: boolean;
    };
    readonly requestTimeout: number;
    constructor(endpoint: string, commitmentOrConfig?: Commitment | ConnectionWithRetriesConfig);
}
