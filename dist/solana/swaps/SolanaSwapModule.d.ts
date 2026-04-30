import { SolanaSwapProgram } from "./SolanaSwapProgram";
import { Program } from "@coral-xyz/anchor";
import { SwapProgram } from "./v1/programTypes";
import { SolanaProgramModule } from "../program/SolanaProgramModule";
import { SolanaChainInterface } from "../chain/SolanaChainInterface";
import { SwapProgramV2 } from "./v2/programTypes";
export declare class SolanaSwapModule extends SolanaProgramModule<SwapProgram | SwapProgramV2> {
    protected readonly program: SolanaSwapProgram;
    protected readonly swapProgram: Program<SwapProgram | SwapProgramV2>;
    constructor(chainInterface: SolanaChainInterface, program: SolanaSwapProgram);
}
