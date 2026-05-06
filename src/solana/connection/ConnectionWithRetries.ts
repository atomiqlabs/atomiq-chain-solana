import {Commitment, Connection, ConnectionConfig} from "@solana/web3.js";
import {tryWithRetries} from "../../utils/Utils";

export type ConnectionWithRetriesConfig = ConnectionConfig & {
    retryPolicy?: {
        maxRetries?: number, delay?: number, exponential?: boolean
    };
    requestTimeout?: number;
};

/**
 * Solana connection with retry logic and request timeout handling for RPC calls.
 *
 * @category Providers
 */
export class ConnectionWithRetries extends Connection {

    /**
     * Retry policy used for RPC requests.
     */
    readonly retryPolicy?: {
        maxRetries?: number, delay?: number, exponential?: boolean
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
    constructor(endpoint: string, commitmentOrConfig?: Commitment | ConnectionWithRetriesConfig) {
        let config: ConnectionWithRetriesConfig;
        if(typeof(commitmentOrConfig)==="string") {
            config = {commitment: commitmentOrConfig};
        } else {
            config = commitmentOrConfig ?? {};
        }

        config.fetch = (input: RequestInfo | URL, init?: RequestInit) => tryWithRetries(
            async () => {
                let timedOut = false;
                const abortController = new AbortController();
                const timeoutHandle = setTimeout(() => {
                    timedOut = true;
                    abortController.abort('Timed out');
                }, this.requestTimeout);
                let originalSignal: AbortSignal | undefined;
                if (init?.signal != null) {
                    originalSignal = init.signal;
                    init.signal.addEventListener('abort', (reason) => {
                        clearTimeout(timeoutHandle);
                        abortController.abort(reason);
                    });
                }
                const result = await fetch(input, {
                    ...init,
                    signal: abortController.signal
                }).catch((e: any) => {
                    console.error('SolanaWalletProvider: fetchWithTimeout(' + typeof e + '): ', e);
                    if (
                        e.name === 'AbortError' &&
                        (originalSignal == null || !originalSignal.aborted) &&
                        timedOut
                    ) {
                        throw new Error('Network request timed out');
                    } else {
                        throw e;
                    }
                });
                if(Math.floor(result.status/100)===5) {
                    throw new Error(`Internal server error: ${result.status}`);
                }
                if(result.status===429) {
                    throw new Error(`Too many requests (429)`);
                }
                return result;
            },
            this.retryPolicy,
            (e) =>
                !e?.message?.startsWith?.("Internal server error: ") &&
                e?.message!=="Network request timed out" &&
                e?.message!=="Too many requests (429)",
            init?.signal ?? undefined
        );
        config.disableRetryOnRateLimit = true;

        super(endpoint, config);
        this.retryPolicy = config?.retryPolicy;
        this.requestTimeout = config?.requestTimeout ?? 15*1000;
    }

}
