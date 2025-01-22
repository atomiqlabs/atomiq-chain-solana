import { SolanaModule } from "../SolanaModule";
import { Commitment } from "@solana/web3.js";
export declare class SolanaSlots extends SolanaModule {
    readonly SLOT_CACHE_SLOTS = 12;
    readonly SLOT_CACHE_TIME: number;
    private slotCache;
    /**
     * Initiates fetch of a given slot & saves it to cache
     *
     * @param commitment
     * @private
     */
    private fetchAndSaveSlot;
    /**
     * Gets the latest slot for a given commitment, with the timestamp of when that slot was actually retrieved from
     *  the RPC (useful for when slots are cached), does no estimation on the current slot number based on cached value
     *
     * @param commitment
     */
    getSlotAndTimestamp(commitment: Commitment): Promise<{
        slot: number;
        timestamp: number;
    }>;
    /**
     * Gets the slot for a given commitment, uses slot cache & tries to estimate current slot based on the cached
     *  value, cache has relatively short expiry of just 12 slots (4.8 seconds)
     *
     * @param commitment
     */
    getSlot(commitment: Commitment): Promise<number>;
}
