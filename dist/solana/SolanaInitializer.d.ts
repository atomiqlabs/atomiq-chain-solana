import { BaseTokenType, BitcoinNetwork, BitcoinRpc, ChainData, ChainInitializer, IStorageManager, StorageObject } from "@atomiqlabs/base";
import { Connection } from "@solana/web3.js";
import { StoredDataAccount } from "./swaps/modules/SolanaDataAccount";
import { SolanaRetryPolicy } from "./chain/SolanaChainInterface";
import { SolanaFees } from "./chain/modules/SolanaFees";
import { SolanaChainType } from "./SolanaChainType";
/**
 * Token assets available on Solana
 * @category Chain Interface
 */
export type SolanaAssetsType = BaseTokenType<"WBTC" | "USDC" | "USDT" | "SOL" | "BONK">;
/**
 * Configuration options for initializing Solana chain
 * @category Chain Interface
 */
export type SolanaSwapperOptions = {
    rpcUrl: string | Connection;
    dataAccountStorage?: IStorageManager<StoredDataAccount>;
    retryPolicy?: SolanaRetryPolicy;
    btcRelayContract?: string;
    swapContract?: string;
    fees?: SolanaFees;
};
/**
 * Initialize Solana chain integration
 * @category Chain Interface
 */
export declare function initializeSolana(options: SolanaSwapperOptions, bitcoinRpc: BitcoinRpc<any>, network: BitcoinNetwork, storageCtor: <T extends StorageObject>(name: string) => IStorageManager<T>): ChainData<SolanaChainType>;
/**
 * Type definition for the Solana chain initializer
 * @category Chain Interface
 */
export type SolanaInitializerType = ChainInitializer<SolanaSwapperOptions, SolanaChainType, SolanaAssetsType>;
/**
 * Solana chain initializer instance
 * @category Chain Interface
 */
export declare const SolanaInitializer: SolanaInitializerType;
