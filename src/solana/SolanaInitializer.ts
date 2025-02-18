import {
    BaseTokenType,
    BitcoinNetwork,
    BitcoinRpc,
    ChainData,
    ChainInitializer,
    IStorageManager,
    StorageObject
} from "@atomiqlabs/base";
import {Connection} from "@solana/web3.js";
import {StoredDataAccount} from "./swaps/modules/SolanaDataAccount";
import {SolanaRetryPolicy} from "./base/SolanaBase";
import {SolanaFees} from "./base/modules/SolanaFees";
import {SolanaChainType} from "./SolanaChainType";
import {SolanaBtcRelay} from "./btcrelay/SolanaBtcRelay";
import {SolanaChains} from "./SolanaChains";
import {SolanaSwapProgram} from "./swaps/SolanaSwapProgram";
import {SolanaChainEventsBrowser} from "./events/SolanaChainEventsBrowser";
import {SolanaSwapData} from "./swaps/SolanaSwapData";

const chainId = "SOLANA" as const;

export type SolanaAssetsType = BaseTokenType<"WBTC" | "USDC" | "USDT" | "SOL" | "BONK">;
const SolanaAssets: SolanaAssetsType = {
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
} as const;

export type SolanaSwapperOptions = {
    rpcUrl: string | Connection,
    dataAccountStorage?: IStorageManager<StoredDataAccount>,
    retryPolicy?: SolanaRetryPolicy,

    btcRelayContract?: string,
    swapContract?: string,

    fees?: SolanaFees
};

export function initializeSolana(
    options: SolanaSwapperOptions,
    bitcoinRpc: BitcoinRpc<any>,
    network: BitcoinNetwork,
    storageCtor: <T extends StorageObject>(name: string) => IStorageManager<T>
): ChainData<SolanaChainType> {
    const connection = typeof(options.rpcUrl)==="string" ?
        new Connection(options.rpcUrl) :
        options.rpcUrl;

    const Fees = options.fees ?? new SolanaFees(connection, 200000, 4, 100);
    const btcRelay = new SolanaBtcRelay(connection, bitcoinRpc, options.btcRelayContract ?? SolanaChains[network].addresses.btcRelayContract, Fees);
    const swapContract = new SolanaSwapProgram(
        connection,
        btcRelay,
        options.dataAccountStorage || storageCtor("solAccounts"),
        options.swapContract ?? SolanaChains[network].addresses.swapContract,
        options.retryPolicy ?? {transactionResendInterval: 1000},
        Fees
    );
    const chainEvents = new SolanaChainEventsBrowser(connection, swapContract);

    return {
        chainId,
        btcRelay,
        swapContract,
        chainEvents,
        swapDataConstructor: SolanaSwapData,
        //These are defined here to keep the data from old SolLightning-sdk, not needed for other chains
        storagePrefix: "SOLv4-"+network+"-"
    };
}

export type SolanaInitializerType = ChainInitializer<SolanaSwapperOptions, SolanaChainType, SolanaAssetsType>;
export const SolanaInitializer: SolanaInitializerType = {
    chainId,
    chainType: null as SolanaChainType,
    initializer: initializeSolana,
    tokens: SolanaAssets,
    options: null as SolanaSwapperOptions
} as const;
