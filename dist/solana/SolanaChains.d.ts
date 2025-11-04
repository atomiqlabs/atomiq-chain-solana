import { BitcoinNetwork } from "@atomiqlabs/base";
export declare const SolanaChains: {
    [key in BitcoinNetwork]?: {
        addresses: {
            swapContract: string;
            btcRelayContract: string;
        };
    };
};
