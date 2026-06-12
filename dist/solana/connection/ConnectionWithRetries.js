"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionWithRetries = void 0;
const web3_js_1 = require("@solana/web3.js");
const Utils_1 = require("../../utils/Utils");
/**
 * Solana connection with retry logic and request timeout handling for RPC calls.
 *
 * @category Providers
 */
class ConnectionWithRetries extends web3_js_1.Connection {
    /**
     * Constructs a retry-enabled Solana connection.
     *
     * @param endpoint RPC endpoint URL
     * @param commitmentOrConfig Commitment level or full connection configuration
     */
    constructor(endpoint, commitmentOrConfig) {
        let config;
        if (typeof (commitmentOrConfig) === "string") {
            config = { commitment: commitmentOrConfig };
        }
        else {
            config = commitmentOrConfig ?? {};
        }
        config.fetch = (input, init) => (0, Utils_1.tryWithRetries)(async () => {
            if (init?.signal?.aborted) {
                throw init.signal.reason instanceof Error
                    ? init.signal.reason
                    : new Error("Aborted");
            }
            const abortController = new AbortController();
            const timeoutHandle = setTimeout(() => {
                abortController.abort(new Error('Network request timed out'));
            }, this.requestTimeout);
            let originalSignal;
            let originalSignalListener;
            if (init?.signal != null) {
                originalSignal = init.signal;
                originalSignal.addEventListener('abort', originalSignalListener = () => {
                    clearTimeout(timeoutHandle);
                    abortController.abort(originalSignal?.reason instanceof Error
                        ? originalSignal?.reason
                        : new Error("Aborted"));
                });
            }
            try {
                const result = await fetch(input, {
                    ...init,
                    signal: abortController.signal
                });
                if (Math.floor(result.status / 100) === 5) {
                    throw new Error(`Internal server error: ${result.status}`);
                }
                if (result.status === 429) {
                    throw new Error(`Too many requests (429)`);
                }
                try {
                    const textResult = await result.text();
                    return new Response(textResult, {
                        status: result.status,
                        statusText: result.statusText,
                        headers: result.headers,
                    });
                }
                catch (e) {
                    console.error(`ConnectionWithRetries: fetch(): Failed to read response body: `, e);
                    throw new Error("Error reading response body");
                }
            }
            finally {
                clearTimeout(timeoutHandle);
                if (originalSignal != null && originalSignalListener != null)
                    originalSignal.removeEventListener("abort", originalSignalListener);
            }
        }, this.retryPolicy, (e) => !e?.message?.startsWith?.("Internal server error: ") &&
            e?.message !== "Network request timed out" &&
            e?.message !== "Too many requests (429)" &&
            e?.message !== "Error reading response body", init?.signal ?? undefined);
        config.disableRetryOnRateLimit = true;
        super(endpoint, config);
        this.retryPolicy = config?.retryPolicy;
        this.requestTimeout = config?.requestTimeout ?? 15 * 1000;
    }
}
exports.ConnectionWithRetries = ConnectionWithRetries;
