import {BitcoinNetwork} from "@atomiqlabs/base";

export const SolanaChains: {[key in BitcoinNetwork]?: {
    addresses: {[version in "v1" | "v2"]?: {swapContract: string, btcRelayContract: string}}
    clusterName: "mainnet-beta" | "devnet" | "testnet"
}} = {
    [BitcoinNetwork.TESTNET4]: {
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
    [BitcoinNetwork.TESTNET]: {
        addresses: {
            v1: {
                swapContract: "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM",
                btcRelayContract: "3KHSHFpEK6bsjg3bqcxQ9qssJYtRCMi2S9TYVe4q6CQc"
            }
        },
        clusterName: "devnet"
    },
    [BitcoinNetwork.MAINNET]: {
        addresses: {
            v1: {
                swapContract: "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM",
                btcRelayContract: "3KHSHFpEK6bsjg3bqcxQ9qssJYtRCMi2S9TYVe4q6CQc"
            }
        },
        clusterName: "mainnet-beta"
    }
} as const;
