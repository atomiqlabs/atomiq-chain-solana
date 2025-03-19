import { SolanaModule } from "../SolanaModule";
import { Commitment, ParsedAccountsModeBlockResponse } from "@solana/web3.js";
export declare class SolanaBlocks extends SolanaModule {
    private blockCache;
    /**
     * Initiates a fetch of the block at specified slot & saves the fetch promise into a block cache
     *
     * @param slot
     * @private
     */
    private fetchAndSaveParsedBlock;
    /**
     * Tries to find the latest existing block for a given commitment, skipping blocks that are not available, runs a
     *  search backwards from the latest slot for the given commitment and fails after 10 tries
     *
     * @param commitment
     */
    findLatestParsedBlock(commitment: Commitment): Promise<{
        block: ParsedAccountsModeBlockResponse;
        slot: number;
    }>;
    /**
     * Gets parsed block for a given slot, uses block cache if the block was already fetched before
     *
     * @param slot
     */
    getParsedBlock(slot: number): Promise<ParsedAccountsModeBlockResponse>;
}
