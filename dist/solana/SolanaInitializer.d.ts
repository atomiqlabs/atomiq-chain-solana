import { BitcoinNetwork, BitcoinRpc, ChainData, IStorageManager, StorageObject } from "@atomiqlabs/base";
import { Connection } from "@solana/web3.js";
import { StoredDataAccount } from "./swaps/modules/SolanaDataAccount";
import { SolanaRetryPolicy } from "./base/SolanaBase";
import { SolanaFees } from "./base/modules/SolanaFees";
import { SolanaChainType } from "./SolanaChainType";
declare const SolanaAssets: {
    readonly WBTC: {
        readonly address: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh";
        readonly decimals: 8;
    };
    readonly USDC: {
        readonly address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        readonly decimals: 6;
    };
    readonly USDT: {
        readonly address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
        readonly decimals: 6;
    };
    readonly SOL: {
        readonly address: "So11111111111111111111111111111111111111112";
        readonly decimals: 9;
    };
    readonly BONK: {
        readonly address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
        readonly decimals: 5;
    };
};
export type SolanaAssetsType = typeof SolanaAssets;
export type SolanaSwapperOptions = {
    rpcUrl: string | Connection;
    dataAccountStorageCtor: (name: string) => IStorageManager<StoredDataAccount>;
    dataAccountStorage?: IStorageManager<StoredDataAccount>;
    retryPolicy?: SolanaRetryPolicy;
    btcRelayContract?: string;
    swapContract?: string;
    fees?: SolanaFees;
};
export declare function initializeSolana(options: SolanaSwapperOptions, bitcoinRpc: BitcoinRpc<any>, network: BitcoinNetwork, storageCtor: <T extends StorageObject>(name: string) => IStorageManager<T>): ChainData<SolanaChainType>;
export declare const SolanaInitializer: {
    readonly chainId: "SOLANA";
    readonly chainType: SolanaChainType;
    readonly initializer: typeof initializeSolana;
    readonly tokens: {
        readonly WBTC: {
            readonly address: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh";
            readonly decimals: 8;
        };
        readonly USDC: {
            readonly address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            readonly decimals: 6;
        };
        readonly USDT: {
            readonly address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
            readonly decimals: 6;
        };
        readonly SOL: {
            readonly address: "So11111111111111111111111111111111111111112";
            readonly decimals: 9;
        };
        readonly BONK: {
            readonly address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
            readonly decimals: 5;
        };
    };
    readonly options: SolanaSwapperOptions;
};
export type SolanaInitializerType = typeof SolanaInitializer;
export {};
