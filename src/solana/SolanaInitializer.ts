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
import {SolanaChainInterface, SolanaRetryPolicy} from "./chain/SolanaChainInterface";
import {SolanaFees} from "./chain/modules/SolanaFees";
import {SolanaChainType} from "./SolanaChainType";
import {SolanaBtcRelay} from "./btcrelay/SolanaBtcRelay";
import {SolanaChains} from "./SolanaChains";
import {SolanaSwapProgram} from "./swaps/SolanaSwapProgram";
import {SolanaChainEventsBrowser} from "./events/SolanaChainEventsBrowser";
import {SolanaSwapData, SolanaSwapDataV1, SolanaSwapDataV2} from "./swaps/SolanaSwapData";

const chainId = "SOLANA" as const;

/**
 * Token assets available on Solana
 * @category Chain Interface
 */
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

/**
 * Configuration options for initializing Solana chain
 * @category Chain Interface
 */
export type SolanaSwapperOptions = {
    /**
     * RPC url or {@link Connection} object to use for Solana network access
     */
    rpcUrl: string | Connection,
    /**
     * Storage backend to use for storing ephemeral data submission accounts, i.e. accounts that are used
     *  to submit large amount of data to an instruction that would otherwise be bigger than the transaction
     *  size limit - used for submitting bitcoin transaction proofs for PrTLC swaps
     */
    dataAccountStorage?: IStorageManager<StoredDataAccount>,
    /**
     * Retry policy to be used for Solana RPC calls and transaction submission
     */
    retryPolicy?: SolanaRetryPolicy,

    /**
     * Optional Solana program address of the BTC Relay contract, uses the canonical deployment by default
     */
    btcRelayContract?: string,
    /**
     * Optional Solana program address of the Swap contract, uses the canonical deployment by default
     */
    swapContract?: string,

    /**
     * Solana fee API to use for fetching Solana network fees
     */
    fees?: SolanaFees,

    /**
     * Determines the default version of the contracts exposed
     */
    defaultVersion?: "v1" | "v2"
};

/**
 * Initialize Solana chain integration
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
    const chainInterface = new SolanaChainInterface(connection, options.retryPolicy ?? {transactionResendInterval: 1000}, Fees);

    const versionedContracts: {
        [version in "v1" | "v2"]?: {
            btcRelay: SolanaBtcRelay<any>;
            swapContract: SolanaSwapProgram;
            swapDataConstructor: new (data: any) => SolanaSwapData;
            spvVaultContract: never;
            spvVaultDataConstructor: never;
            spvVaultWithdrawalDataConstructor: never;
        }
    } = {};

    const version = options.defaultVersion ?? "v1";
    if(options.btcRelayContract || options.swapContract) {
        // Initialize only that version
        const btcRelayContractAddress = options.btcRelayContract ?? SolanaChains[network]?.addresses[version]?.btcRelayContract;
        const swapContractAddress = options.swapContract ?? SolanaChains[network]?.addresses[version]?.swapContract;
        if(btcRelayContractAddress==null) throw new Error(`Unsupported bitcoin network for Solana, using default version ${version}: ${BitcoinNetwork[network]}, please pass a custom deployment btc relay program address!`);
        if(swapContractAddress==null) throw new Error(`Unsupported bitcoin network for Solana, using default version ${version}: ${BitcoinNetwork[network]}, please pass a custom deployment swap program address!`);

        const btcRelay = new SolanaBtcRelay(chainInterface, bitcoinRpc, btcRelayContractAddress);
        const swapContract = new SolanaSwapProgram(
            chainInterface,
            btcRelay,
            options.dataAccountStorage || storageCtor("solAccounts"),
            swapContractAddress,
            version
        );

        versionedContracts[version] = {
            btcRelay,
            swapContract,
            swapDataConstructor: version==="v1" ? SolanaSwapDataV1 : SolanaSwapDataV2,
            spvVaultContract: null as never,
            spvVaultDataConstructor: null as never,
            spvVaultWithdrawalDataConstructor: null as never
        };
    } else {
        // Initialize all versions
        const solanaChainData = SolanaChains[network];
        if(solanaChainData==null) throw new Error(`Unsupported bitcoin network for Solana: ${BitcoinNetwork[network]}, please pass a custom deployment program addresses!`);

        for(let _version in solanaChainData.addresses) {
            const version = _version as "v1" | "v2";
            const btcRelay = new SolanaBtcRelay(chainInterface, bitcoinRpc, solanaChainData.addresses[version]!.btcRelayContract);
            const swapContract = new SolanaSwapProgram(
                chainInterface,
                btcRelay,
                options.dataAccountStorage || storageCtor("solAccounts"),
                solanaChainData.addresses[version]!.swapContract,
                version
            );

            versionedContracts[version] = {
                btcRelay,
                swapContract,
                swapDataConstructor: version==="v1" ? SolanaSwapDataV1 : SolanaSwapDataV2,
                spvVaultContract: null as never,
                spvVaultDataConstructor: null as never,
                spvVaultWithdrawalDataConstructor: null as never
            }
        }
    }

    const chainEvents = new SolanaChainEventsBrowser(connection, versionedContracts);

    const defaults = versionedContracts[version];
    if(defaults==null) throw new Error(`Unsupported bitcoin network for Solana, using default version ${version}: ${BitcoinNetwork[network]}, please pass a custom deployment program addresses!`);

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
 * Type definition for the Solana chain initializer
 *
 * @category Chain Interface
 */
export type SolanaInitializerType = ChainInitializer<SolanaSwapperOptions, SolanaChainType, SolanaAssetsType>;

/**
 * Solana chain initializer instance, used in the SwapperFactory constructor in the SDK library
 *
 * @category Chain Interface
 */
export const SolanaInitializer: SolanaInitializerType = {
    chainId,
    chainType: null as unknown as SolanaChainType,
    initializer: initializeSolana,
    tokens: SolanaAssets,
    options: null as unknown as SolanaSwapperOptions
} as const;
