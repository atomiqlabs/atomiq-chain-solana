import { ChainType } from "@atomiqlabs/base";
import { SignedSolanaTx, SolanaTx } from "./chain/modules/SolanaTransactions";
import { SolanaPreFetchData, SolanaPreFetchVerification } from "./swaps/modules/SwapInit";
import { SolanaSigner } from "./wallet/SolanaSigner";
import { SolanaSwapProgram } from "./swaps/SolanaSwapProgram";
import { SolanaSwapData } from "./swaps/SolanaSwapData";
import { SolanaChainEventsBrowser } from "./events/SolanaChainEventsBrowser";
import { SolanaBtcRelay } from "./btcrelay/SolanaBtcRelay";
import { SolanaChainInterface } from "./chain/SolanaChainInterface";
import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
/**
 * Type definition for the Solana chain implementation
 * @category Chain Interface
 */
export type SolanaChainType = ChainType<"SOLANA", SolanaPreFetchData, SolanaPreFetchVerification, SolanaTx, SignedSolanaTx, SolanaSigner, Wallet, SolanaSwapData, SolanaSwapProgram, SolanaChainInterface, SolanaChainEventsBrowser, SolanaBtcRelay<any>, never, never, never>;
