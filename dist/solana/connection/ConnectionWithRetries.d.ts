import { Commitment, Connection, ConnectionConfig } from "@solana/web3.js";
export type ConnectionWithRetriesConfig = ConnectionConfig & {
    retryPolicy?: {
        maxRetries?: number;
        delay?: number;
        exponential?: boolean;
    };
    requestTimeout?: number;
};
/**
 * Solana connection with retry logic and request timeout handling for RPC calls.
 *
 * @category Providers
 */
export declare class ConnectionWithRetries extends Connection {
    /**
     * Retry policy used for RPC requests.
     */
    readonly retryPolicy?: {
        maxRetries?: number;
        delay?: number;
        exponential?: boolean;
    };
    /**
     * Per-request timeout in milliseconds.
     */
    readonly requestTimeout: number;
    /**
     * Constructs a retry-enabled Solana connection.
     *
     * @param endpoint RPC endpoint URL
     * @param commitmentOrConfig Commitment level or full connection configuration
     */
    constructor(endpoint: string, commitmentOrConfig?: Commitment | ConnectionWithRetriesConfig);
}
