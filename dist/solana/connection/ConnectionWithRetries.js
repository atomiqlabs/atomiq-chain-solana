"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionWithRetries = void 0;
const web3_js_1 = require("@solana/web3.js");
const Utils_1 = require("../../utils/Utils");
class ConnectionWithRetries extends web3_js_1.Connection {
    constructor(endpoint, commitmentOrConfig) {
        let config;
        if (typeof (commitmentOrConfig) === "string") {
            config = { commitment: commitmentOrConfig };
        }
        else {
            config = commitmentOrConfig ?? {};
        }
        config.fetch = (input, init) => (0, Utils_1.tryWithRetries)(async () => {
            let timedOut = false;
            const abortController = new AbortController();
            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                abortController.abort('Timed out');
            }, this.requestTimeout);
            let originalSignal;
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
            }).catch((e) => {
                console.error('SolanaWalletProvider: fetchWithTimeout(' + typeof e + '): ', e);
                if (e.name === 'AbortError' &&
                    (originalSignal == null || !originalSignal.aborted) &&
                    timedOut) {
                    throw new Error('Network request timed out');
                }
                else {
                    throw e;
                }
            });
            if (Math.floor(result.status / 100) === 5) {
                throw new Error(`Internal server error: ${result.status}`);
            }
            if (result.status === 429) {
                throw new Error(`Too many requests (429)`);
            }
            return result;
        }, this.retryPolicy, (e) => !e?.message?.startsWith?.("Internal server error: ") &&
            e?.message !== "Network request timed out" &&
            e?.message !== "Too many requests (429)", init?.signal ?? undefined);
        config.disableRetryOnRateLimit = true;
        super(endpoint, commitmentOrConfig);
        this.retryPolicy = config?.retryPolicy;
        this.requestTimeout = config?.requestTimeout ?? 15 * 1000;
    }
}
exports.ConnectionWithRetries = ConnectionWithRetries;
