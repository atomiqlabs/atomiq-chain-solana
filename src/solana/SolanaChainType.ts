import {ChainType} from "@atomiqlabs/base";
import {SolanaTx} from "./chain/modules/SolanaTransactions";
import {SolanaPreFetchData, SolanaPreFetchVerification} from "./swaps/modules/SwapInit";
import {SolanaSigner} from "./wallet/SolanaSigner";
import {SolanaSwapProgram} from "./swaps/SolanaSwapProgram";
import {SolanaSwapData} from "./swaps/SolanaSwapData";
import {SolanaChainEventsBrowser} from "./events/SolanaChainEventsBrowser";
import {SolanaBtcRelay} from "./btcrelay/SolanaBtcRelay";
import {SolanaChainInterface} from "./chain/SolanaChainInterface";

export type SolanaChainType = ChainType<
    "SOLANA",
    SolanaPreFetchData,
    SolanaPreFetchVerification,
    SolanaTx,
    SolanaSigner,
    SolanaSwapData,
    SolanaSwapProgram,
    SolanaChainInterface,
    SolanaChainEventsBrowser,
    SolanaBtcRelay<any>,
    never,
    never,
    never
>;
