import { BitcoinNetwork } from "@atomiqlabs/base";
export declare const SolanaChains: {
    [key in BitcoinNetwork]?: {
        addresses: {
            [version in "v1" | "v2"]?: {
                swapContract: string;
                btcRelayContract: string;
            };
        };
        clusterName: "mainnet-beta" | "devnet" | "testnet";
    };
};
