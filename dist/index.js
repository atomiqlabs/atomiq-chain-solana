"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSwapData = exports.SolanaChainEventsBrowser = exports.ConnectionWithRetries = exports.SolanaBtcStoredHeader = exports.SolanaBtcHeader = void 0;
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
var SolanaBtcHeader_1 = require("./solana/btcrelay/headers/SolanaBtcHeader");
Object.defineProperty(exports, "SolanaBtcHeader", { enumerable: true, get: function () { return SolanaBtcHeader_1.SolanaBtcHeader; } });
var SolanaBtcStoredHeader_1 = require("./solana/btcrelay/headers/SolanaBtcStoredHeader");
Object.defineProperty(exports, "SolanaBtcStoredHeader", { enumerable: true, get: function () { return SolanaBtcStoredHeader_1.SolanaBtcStoredHeader; } });
__exportStar(require("./solana/btcrelay/SolanaBtcRelay"), exports);
__exportStar(require("./solana/chain/SolanaChainInterface"), exports);
__exportStar(require("./solana/chain/modules/SolanaFees"), exports);
var ConnectionWithRetries_1 = require("./solana/connection/ConnectionWithRetries");
Object.defineProperty(exports, "ConnectionWithRetries", { enumerable: true, get: function () { return ConnectionWithRetries_1.ConnectionWithRetries; } });
var SolanaChainEventsBrowser_1 = require("./solana/events/SolanaChainEventsBrowser");
Object.defineProperty(exports, "SolanaChainEventsBrowser", { enumerable: true, get: function () { return SolanaChainEventsBrowser_1.SolanaChainEventsBrowser; } });
__exportStar(require("./solana/swaps/SolanaSwapProgram"), exports);
var SolanaSwapData_1 = require("./solana/swaps/SolanaSwapData");
Object.defineProperty(exports, "SolanaSwapData", { enumerable: true, get: function () { return SolanaSwapData_1.SolanaSwapData; } });
__exportStar(require("./solana/wallet/SolanaKeypairWallet"), exports);
__exportStar(require("./solana/wallet/SolanaSigner"), exports);
__exportStar(require("./solana/SolanaChainType"), exports);
__exportStar(require("./solana/SolanaInitializer"), exports);
