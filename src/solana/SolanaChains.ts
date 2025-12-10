import {BitcoinNetwork} from "@atomiqlabs/base";

export const SolanaChains: {[key in BitcoinNetwork]?: {addresses: {swapContract: string, btcRelayContract: string}}} = {
    //TODO: Not deployed yet
    // [BitcoinNetwork.TESTNET4]: {
    //     addresses: {
    //         swapContract: "11111111111111111111111111111111",
    //         btcRelayContract: "11111111111111111111111111111111"
    //     }
    // },
    [BitcoinNetwork.TESTNET]: {
        addresses: {
            swapContract: "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM",
            btcRelayContract: "3KHSHFpEK6bsjg3bqcxQ9qssJYtRCMi2S9TYVe4q6CQc"
        }
    },
    [BitcoinNetwork.MAINNET]: {
        addresses: {
            swapContract: "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM",
            btcRelayContract: "3KHSHFpEK6bsjg3bqcxQ9qssJYtRCMi2S9TYVe4q6CQc"
        }
    }
} as const;
