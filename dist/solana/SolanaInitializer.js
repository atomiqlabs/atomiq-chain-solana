"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaInitializer = exports.initializeSolana = void 0;
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
function initializeSolana(options, bitcoinRpc, network, storageCtor) {
    const connection = typeof (options.rpcUrl) === "string" ?
        new web3_js_1.Connection(options.rpcUrl) :
        options.rpcUrl;
    const solanaChainData = SolanaChains_1.SolanaChains[network];
    if (solanaChainData == null)
        throw new Error(`Unsupported bitcoin network for Solana: ${base_1.BitcoinNetwork[network]}`);
    const Fees = options.fees ?? new SolanaFees_1.SolanaFees(connection, 200000, 4, 100);
    const chainInterface = new SolanaChainInterface_1.SolanaChainInterface(connection, options.retryPolicy ?? { transactionResendInterval: 1000 }, Fees);
    const btcRelay = new SolanaBtcRelay_1.SolanaBtcRelay(chainInterface, bitcoinRpc, options.btcRelayContract ?? solanaChainData.addresses.btcRelayContract);
    const swapContract = new SolanaSwapProgram_1.SolanaSwapProgram(chainInterface, btcRelay, options.dataAccountStorage || storageCtor("solAccounts"), options.swapContract ?? solanaChainData.addresses.swapContract);
    const chainEvents = new SolanaChainEventsBrowser_1.SolanaChainEventsBrowser(connection, swapContract);
    return {
        chainId,
        btcRelay,
        swapContract,
        chainEvents,
        swapDataConstructor: SolanaSwapData_1.SolanaSwapData,
        chainInterface,
        spvVaultContract: null,
        spvVaultDataConstructor: null,
        spvVaultWithdrawalDataConstructor: null
    };
}
exports.initializeSolana = initializeSolana;
exports.SolanaInitializer = {
    chainId,
    chainType: null,
    initializer: initializeSolana,
    tokens: SolanaAssets,
    options: null
};
