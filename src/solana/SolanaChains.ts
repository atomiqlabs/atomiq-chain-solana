import {BitcoinNetwork} from "@atomiqlabs/base";

export const SolanaChains: {[key in BitcoinNetwork]?: {
    addresses: {[version in "v1" | "v2"]?: {swapContract: string, btcRelayContract: string}}
    clusterName: "mainnet-beta" | "devnet" | "testnet"
}} = {
    //TODO: Not deployed yet
    // [BitcoinNetwork.TESTNET4]: {
    //     addresses: {
    //         swapContract: "11111111111111111111111111111111",
    //         btcRelayContract: "11111111111111111111111111111111"
    //     }
    // },
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
