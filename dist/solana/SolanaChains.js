"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaChains = void 0;
const base_1 = require("@atomiqlabs/base");
exports.SolanaChains = {
    [base_1.BitcoinNetwork.TESTNET4]: {
        addresses: {
            v1: {
                swapContract: "7g6iDybm7XiiPidYwQ5DbuCREro39St52Xn7V3NV2EE4",
                btcRelayContract: "CBYz9cgBG6v8kF19jhLk46gPRhY858NV1MfngzGzwgdX"
            },
            v2: {
                swapContract: "8YiqJKjuS7zKPYoxdMFsfPpavPYCnu13Yx1CFqgV6o43",
                btcRelayContract: "HKKJKW1jWh3DZptNSABZ4iKUvjxYvic4tb3qnqNvBZoF"
            }
        },
        clusterName: "devnet"
    },
    [base_1.BitcoinNetwork.TESTNET]: {
        addresses: {
            v1: {
                swapContract: "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM",
                btcRelayContract: "3KHSHFpEK6bsjg3bqcxQ9qssJYtRCMi2S9TYVe4q6CQc"
            },
            v2: {
                swapContract: "atq2FYuvww5EF6qeB28gj9tkao6Ld9mEGUzF4M93cCC",
                btcRelayContract: "btc2WHkrjoZU9xzFJupDCmMaUTRHyYTzJE25LvEi9Ls"
            }
        },
        clusterName: "devnet"
    },
    [base_1.BitcoinNetwork.MAINNET]: {
        addresses: {
            v1: {
                swapContract: "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM",
                btcRelayContract: "3KHSHFpEK6bsjg3bqcxQ9qssJYtRCMi2S9TYVe4q6CQc"
            }
        },
        clusterName: "mainnet-beta"
    }
};
