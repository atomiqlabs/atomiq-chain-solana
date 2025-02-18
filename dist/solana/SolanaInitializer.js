"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaInitializer = exports.initializeSolana = void 0;
const web3_js_1 = require("@solana/web3.js");
const SolanaFees_1 = require("./base/modules/SolanaFees");
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
    var _a, _b, _c, _d;
    const connection = typeof (options.rpcUrl) === "string" ?
        new web3_js_1.Connection(options.rpcUrl) :
        options.rpcUrl;
    const Fees = (_a = options.fees) !== null && _a !== void 0 ? _a : new SolanaFees_1.SolanaFees(connection, 200000, 4, 100);
    const btcRelay = new SolanaBtcRelay_1.SolanaBtcRelay(connection, bitcoinRpc, (_b = options.btcRelayContract) !== null && _b !== void 0 ? _b : SolanaChains_1.SolanaChains[network].addresses.btcRelayContract, Fees);
    const swapContract = new SolanaSwapProgram_1.SolanaSwapProgram(connection, btcRelay, options.dataAccountStorage || storageCtor("solAccounts"), (_c = options.swapContract) !== null && _c !== void 0 ? _c : SolanaChains_1.SolanaChains[network].addresses.swapContract, (_d = options.retryPolicy) !== null && _d !== void 0 ? _d : { transactionResendInterval: 1000 }, Fees);
    const chainEvents = new SolanaChainEventsBrowser_1.SolanaChainEventsBrowser(connection, swapContract);
    return {
        chainId,
        btcRelay,
        swapContract,
        chainEvents,
        swapDataConstructor: SolanaSwapData_1.SolanaSwapData,
        //These are defined here to keep the data from old SolLightning-sdk, not needed for other chains
        storagePrefix: "SOLv4-" + network + "-"
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
