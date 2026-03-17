/**
 * # @atomiqlabs/chain-solana
 *
 * `@atomiqlabs/chain-solana` is the Solana integration package for the Atomiq protocol.
 *
 * Within the Atomiq stack, this library provides the Solana-side building blocks used for Bitcoin-aware swaps on Solana. It includes:
 *
 * - the `SolanaInitializer` used to register Solana support in the Atomiq SDK
 * - the `SolanaChainInterface` used to talk to Solana RPCs
 * - Solana BTC relay and swap program wrappers
 * - signer and wallet helpers for Solana integrations
 * - connection retry and chain event utilities
 *
 * This package is intended for direct protocol integrations and for higher-level Atomiq SDK layers that need Solana chain support.
 *
 * ## Installation
 *
 * Install the package with its `@solana/web3.js` peer dependency:
 *
 * ```bash
 * npm install @atomiqlabs/chain-solana @solana/web3.js
 * ```
 *
 * ## Supported Chains
 *
 * This package exports a single Solana initializer:
 *
 * - Solana via `SolanaInitializer`
 *
 * Canonical deployments currently defined in this package:
 *
 * | Chain | Canonical deployments included |
 * | --- | --- |
 * | Solana | `MAINNET`, `TESTNET` |
 *
 * In this package, the selected Bitcoin network determines which canonical Solana program addresses are used by default. `BitcoinNetwork.TESTNET4` is not wired to a Solana deployment here yet.
 *
 * The Solana implementation doesn't support the UTXO-controlled vault (SPV vault) contract, hence it can only process legacy HTLC & PrTLC based swaps.
 *
 * ## SDK Example
 *
 * Initialize the Atomiq SDK with Solana network support:
 *
 * ```ts
 * import {SolanaInitializer} from "@atomiqlabs/chain-solana";
 * import {BitcoinNetwork, SwapperFactory, TypedSwapper} from "@atomiqlabs/sdk";
 *
 * // Define chains that you want to support here
 * const chains = [SolanaInitializer] as const;
 * type SupportedChains = typeof chains;
 *
 * const Factory = new SwapperFactory<SupportedChains>(chains);
 *
 * const swapper: TypedSwapper<SupportedChains> = Factory.newSwapper({
 *   chains: {
 *     SOLANA: {
 *       rpcUrl: solanaRpc // You can also pass a web3.js Connection object here
 *     }
 *   },
 *   bitcoinNetwork: BitcoinNetwork.MAINNET // or BitcoinNetwork.TESTNET
 * });
 * ```
 *
 * If you use the lower-level initializer directly, you can also provide a custom storage backend for temporary Solana data accounts used when submitting large Bitcoin proof payloads.
 *
 * @packageDocumentation
 */
export {SolanaBtcHeader} from "./solana/btcrelay/headers/SolanaBtcHeader";
export {SolanaBtcStoredHeader} from "./solana/btcrelay/headers/SolanaBtcStoredHeader";
export * from "./solana/btcrelay/SolanaBtcRelay";

export * from "./solana/chain/SolanaChainInterface";
export * from "./solana/chain/modules/SolanaFees";
export {SolanaTx, SignedSolanaTx} from "./solana/chain/modules/SolanaTransactions";

export {ConnectionWithRetries} from "./solana/connection/ConnectionWithRetries";

export {SolanaChainEventsBrowser, SolanaEventListenerState} from "./solana/events/SolanaChainEventsBrowser";

export * from "./solana/swaps/SolanaSwapProgram";
export {SolanaSwapData} from "./solana/swaps/SolanaSwapData";

export * from "./solana/wallet/SolanaKeypairWallet";
export * from "./solana/wallet/SolanaSigner";

export * from "./solana/SolanaChainType";
export * from "./solana/SolanaInitializer";
