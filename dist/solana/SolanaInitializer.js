"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaInitializerV2 = exports.SolanaInitializer = exports.initializeSolanaV2 = exports.initializeSolana = void 0;
const base_1 = require("@atomiqlabs/base");
const web3_js_1 = require("@solana/web3.js");
const SolanaChainInterface_1 = require("./chain/SolanaChainInterface");
const SolanaFees_1 = require("./chain/modules/SolanaFees");
const SolanaBtcRelay_1 = require("./btcrelay/SolanaBtcRelay");
const SolanaChains_1 = require("./SolanaChains");
const SolanaSwapProgram_1 = require("./swaps/SolanaSwapProgram");
const SolanaChainEventsBrowser_1 = require("./events/SolanaChainEventsBrowser");
const SolanaSwapData_1 = require("./swaps/SolanaSwapData");
const chainId = "SOLANA";
const SolanaAssets = {
    WBTC: {
        address: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
        decimals: 8
    },
    USDC: {
        address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6
    },
    USDT: {
        address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        decimals: 6
    },
    SOL: {
        address: "So11111111111111111111111111111111111111112",
        decimals: 9
    },
    BONK: {
        address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        decimals: 5
    }
};
/**
 * Initialize Solana chain integration
 *
 * @param version
 * @param options Options for initializing the Solana chain
 * @param bitcoinRpc Bitcoin RPC to use for bitcoin read access
 * @param network Bitcoin network to use - determines Solana program addresses to use by default
 * @param storageCtor Storage constructor used to create storage backend for ephemeral data submission accounts,
 *  i.e. accounts that are used to submit large amount of data to an instruction that would otherwise be bigger
 *  than the transaction size limit - used for submitting bitcoin transaction proofs for PrTLC swaps
 *
 * @category Chain Interface
 */
function _initializeSolana(version, options, bitcoinRpc, network, storageCtor) {
    const connection = typeof (options.rpcUrl) === "string" ?
        new web3_js_1.Connection(options.rpcUrl) :
        options.rpcUrl;
    const Fees = options.fees ?? new SolanaFees_1.SolanaFees(connection, 200000, 4, 100);
    const chainInterface = new SolanaChainInterface_1.SolanaChainInterface(connection, options.retryPolicy ?? { transactionResendInterval: 1000 }, Fees);
    const versionedContracts = {};
    if (options.btcRelayContract || options.swapContract) {
        // Initialize only that version
        const btcRelayContractAddress = options.btcRelayContract ?? SolanaChains_1.SolanaChains[network]?.addresses[version]?.btcRelayContract;
        const swapContractAddress = options.swapContract ?? SolanaChains_1.SolanaChains[network]?.addresses[version]?.swapContract;
        if (btcRelayContractAddress == null)
            throw new Error(`Unsupported bitcoin network for Solana, using default version ${version}: ${base_1.BitcoinNetwork[network]}, please pass a custom deployment btc relay program address!`);
        if (swapContractAddress == null)
            throw new Error(`Unsupported bitcoin network for Solana, using default version ${version}: ${base_1.BitcoinNetwork[network]}, please pass a custom deployment swap program address!`);
        const btcRelay = new SolanaBtcRelay_1.SolanaBtcRelay(chainInterface, bitcoinRpc, btcRelayContractAddress);
        const swapContract = new SolanaSwapProgram_1.SolanaSwapProgram(chainInterface, btcRelay, options.dataAccountStorage || storageCtor("solAccounts"), swapContractAddress, network, version);
        versionedContracts[version] = {
            btcRelay,
            swapContract: swapContract,
            swapDataConstructor: version === "v1" ? SolanaSwapData_1.SolanaSwapDataV1 : SolanaSwapData_1.SolanaSwapDataV2,
            spvVaultContract: null,
            spvVaultDataConstructor: null,
            spvVaultWithdrawalDataConstructor: null
        };
    }
    else {
        // Initialize all versions
        const solanaChainData = SolanaChains_1.SolanaChains[network];
        if (solanaChainData == null)
            throw new Error(`Unsupported bitcoin network for Solana: ${base_1.BitcoinNetwork[network]}, please pass a custom deployment program addresses!`);
        for (let _version in solanaChainData.addresses) {
            const version = _version;
            const btcRelay = new SolanaBtcRelay_1.SolanaBtcRelay(chainInterface, bitcoinRpc, solanaChainData.addresses[version].btcRelayContract);
            const swapContract = new SolanaSwapProgram_1.SolanaSwapProgram(chainInterface, btcRelay, options.dataAccountStorage || storageCtor("solAccounts"), solanaChainData.addresses[version].swapContract, network, version);
            versionedContracts[version] = {
                btcRelay,
                swapContract: swapContract,
                swapDataConstructor: version === "v1" ? SolanaSwapData_1.SolanaSwapDataV1 : SolanaSwapData_1.SolanaSwapDataV2,
                spvVaultContract: null,
                spvVaultDataConstructor: null,
                spvVaultWithdrawalDataConstructor: null
            };
        }
    }
    const chainEvents = new SolanaChainEventsBrowser_1.SolanaChainEventsBrowser(connection, versionedContracts);
    const defaults = versionedContracts[version];
    if (defaults == null)
        throw new Error(`Unsupported bitcoin network for Solana, using default version ${version}: ${base_1.BitcoinNetwork[network]}, please pass a custom deployment program addresses!`);
    return {
        chainId,
        chainInterface,
        btcRelay: defaults.btcRelay,
        swapContract: defaults.swapContract,
        chainEvents,
        swapDataConstructor: defaults.swapDataConstructor,
        spvVaultContract: defaults.spvVaultContract,
        spvVaultDataConstructor: defaults.spvVaultDataConstructor,
        spvVaultWithdrawalDataConstructor: defaults.spvVaultWithdrawalDataConstructor,
        defaultVersion: version,
        versions: versionedContracts
    };
}
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
function initializeSolana(options, bitcoinRpc, network, storageCtor) {
    return _initializeSolana("v1", options, bitcoinRpc, network, storageCtor);
}
exports.initializeSolana = initializeSolana;
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
function initializeSolanaV2(options, bitcoinRpc, network, storageCtor) {
    return _initializeSolana("v2", options, bitcoinRpc, network, storageCtor);
}
exports.initializeSolanaV2 = initializeSolanaV2;
/**
 * Solana chain initializer instance, used in the SwapperFactory constructor in the SDK library
 *
 * Uses the legacy v1 version of the contract as the default exported version, this doesn't support the new
 *  v2 lightning network flow, use the {@link SolanaInitializerV2} to initialize the SDK with the v2
 *  contracts as the default, which do have an explicit support for new lightning network swap flow
 *
 * @category Chain Interface
 */
exports.SolanaInitializer = {
    chainId,
    chainType: null,
    initializer: initializeSolana,
    tokens: SolanaAssets,
    options: null
};
/**
 * Solana chain initializer instance, used in the SwapperFactory constructor in the SDK library
 *
 * Uses the new v2 version of the contracts as default exported version, supported the new lightning network
 *  swap flow.
 *
 * @category Chain Interface
 */
exports.SolanaInitializerV2 = {
    chainId,
    chainType: null,
    initializer: initializeSolanaV2,
    tokens: SolanaAssets,
    options: null
};
