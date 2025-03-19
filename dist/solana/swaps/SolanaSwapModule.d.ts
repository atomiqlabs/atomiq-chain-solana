import { SolanaSwapProgram } from "./SolanaSwapProgram";
import { Program } from "@coral-xyz/anchor";
import { SwapProgram } from "./programTypes";
import { SolanaProgramModule } from "../program/SolanaProgramModule";
import { SolanaChainInterface } from "../chain/SolanaChainInterface";
export declare class SolanaSwapModule extends SolanaProgramModule<SwapProgram> {
    protected readonly program: SolanaSwapProgram;
    protected readonly swapProgram: Program<SwapProgram>;
    constructor(chainInterface: SolanaChainInterface, program: SolanaSwapProgram);
}
