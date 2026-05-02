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
    /**
     * RPC url or {@link Connection} object to use for Solana network access
     */
    rpcUrl: string | Connection;
    /**
     * Storage backend to use for storing ephemeral data submission accounts, i.e. accounts that are used
     *  to submit large amount of data to an instruction that would otherwise be bigger than the transaction
     *  size limit - used for submitting bitcoin transaction proofs for PrTLC swaps
     */
    dataAccountStorage?: IStorageManager<StoredDataAccount>;
    /**
     * Retry policy to be used for Solana RPC calls and transaction submission
     */
    retryPolicy?: SolanaRetryPolicy;
    /**
     * Optional Solana program address of the BTC Relay contract, uses the canonical deployment by default
     */
    btcRelayContract?: string;
    /**
     * Optional Solana program address of the Swap contract, uses the canonical deployment by default
     */
    swapContract?: string;
    /**
     * Solana fee API to use for fetching Solana network fees
     */
    fees?: SolanaFees;
};
/**
 * Initialize Solana chain integration using the v1 as the default version of the contracts
 *
 * @param options Options for initializing the Solana chain
 * @param bitcoinRpc Bitcoin RPC to use for bitcoin read access
 * @param network Bitcoin network to use - determines Solana program addresses to use by default
 * @param storageCtor Storage constructor used to create storage backend for ephemeral data submission accounts,
 *  i.e. accounts that are used to submit large amount of data to an instruction that would otherwise be bigger
 *  than the transaction size limit - used for submitting bitcoin transaction proofs for PrTLC swaps
 *
 * @category Chain Interface
 */
export declare function initializeSolana(options: SolanaSwapperOptions, bitcoinRpc: BitcoinRpc<any>, network: BitcoinNetwork, storageCtor: <T extends StorageObject>(name: string) => IStorageManager<T>): ChainData<SolanaChainType<"v1">>;
/**
 * Initialize Solana chain integration using the new v2 version as the default version of the contracts
 *
 * @param options Options for initializing the Solana chain
 * @param bitcoinRpc Bitcoin RPC to use for bitcoin read access
 * @param network Bitcoin network to use - determines Solana program addresses to use by default
 * @param storageCtor Storage constructor used to create storage backend for ephemeral data submission accounts,
 *  i.e. accounts that are used to submit large amount of data to an instruction that would otherwise be bigger
 *  than the transaction size limit - used for submitting bitcoin transaction proofs for PrTLC swaps
 *
 * @category Chain Interface
 */
export declare function initializeSolanaV2(options: SolanaSwapperOptions, bitcoinRpc: BitcoinRpc<any>, network: BitcoinNetwork, storageCtor: <T extends StorageObject>(name: string) => IStorageManager<T>): ChainData<SolanaChainType<"v2">>;
/**
 * Type definition for the Solana chain initializer
 *
 * @category Chain Interface
 */
export type SolanaInitializerType<Version extends "v1" | "v2" = "v1"> = ChainInitializer<SolanaSwapperOptions, SolanaChainType<Version>, SolanaAssetsType>;
/**
 * Solana chain initializer instance, used in the SwapperFactory constructor in the SDK library
 *
 * Uses the legacy v1 version of the contract as the default exported version, this doesn't support the new
 *  v2 lightning network flow, use the {@link SolanaInitializerV2} to initialize the SDK with the v2
 *  contracts as the default, which do have an explicit support for new lightning network swap flow
 *
 * @category Chain Interface
 */
export declare const SolanaInitializer: SolanaInitializerType<"v1">;
/**
 * Solana chain initializer instance, used in the SwapperFactory constructor in the SDK library
 *
 * Uses the new v2 version of the contracts as default exported version, supported the new lightning network
 *  swap flow.
 *
 * @category Chain Interface
 */
export declare const SolanaInitializerV2: SolanaInitializerType<"v2">;
