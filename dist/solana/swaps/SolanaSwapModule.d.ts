import { SolanaModule } from "../base/SolanaModule";
import { SolanaSwapProgram } from "./SolanaSwapProgram";
import { Program } from "@coral-xyz/anchor";
import { SwapProgram } from "./programTypes";
export declare class SolanaSwapModule extends SolanaModule {
    readonly root: SolanaSwapProgram;
    readonly program: Program<SwapProgram>;
    constructor(root: SolanaSwapProgram);
}
