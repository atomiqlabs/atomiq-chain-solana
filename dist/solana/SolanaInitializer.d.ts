import { BaseTokenType, BitcoinNetwork, BitcoinRpc, ChainData, ChainInitializer, IStorageManager, StorageObject } from "@atomiqlabs/base";
import { Connection } from "@solana/web3.js";
import { StoredDataAccount } from "./swaps/modules/SolanaDataAccount";
import { SolanaRetryPolicy } from "./chain/SolanaChainInterface";
import { SolanaFees } from "./chain/modules/SolanaFees";
import { SolanaChainType } from "./SolanaChainType";
export type SolanaAssetsType = BaseTokenType<"WBTC" | "USDC" | "USDT" | "SOL" | "BONK">;
export type SolanaSwapperOptions = {
    rpcUrl: string | Connection;
    dataAccountStorage?: IStorageManager<StoredDataAccount>;
    retryPolicy?: SolanaRetryPolicy;
    btcRelayContract?: string;
    swapContract?: string;
    fees?: SolanaFees;
};
export declare function initializeSolana(options: SolanaSwapperOptions, bitcoinRpc: BitcoinRpc<any>, network: BitcoinNetwork, storageCtor: <T extends StorageObject>(name: string) => IStorageManager<T>): ChainData<SolanaChainType>;
export type SolanaInitializerType = ChainInitializer<SolanaSwapperOptions, SolanaChainType, SolanaAssetsType>;
export declare const SolanaInitializer: SolanaInitializerType;
