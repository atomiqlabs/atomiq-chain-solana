"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSlots = void 0;
const SolanaModule_1 = require("../SolanaModule");
class SolanaSlots extends SolanaModule_1.SolanaModule {
    constructor() {
        super(...arguments);
        this.SLOT_CACHE_SLOTS = 12;
        this.SLOT_CACHE_TIME = this.SLOT_CACHE_SLOTS * this.root.SLOT_TIME;
        this.slotCache = {};
    }
    /**
     * Initiates fetch of a given slot & saves it to cache
     *
     * @param commitment
     * @private
     */
    fetchAndSaveSlot(commitment) {
        const slotPromise = this.connection.getSlot(commitment);
        const timestamp = Date.now();
        this.slotCache[commitment] = {
            slot: slotPromise,
            timestamp
        };
        slotPromise.catch(e => {
            if (this.slotCache[commitment] != null && this.slotCache[commitment].slot === slotPromise)
                delete this.slotCache[commitment];
            throw e;
        });
        return {
            slot: slotPromise,
            timestamp
        };
    }
    ///////////////////
    //// Slots
    /**
     * Gets the latest slot for a given commitment, with the timestamp of when that slot was actually retrieved from
     *  the RPC (useful for when slots are cached), does no estimation on the current slot number based on cached value
     *
     * @param commitment
     */
    async getSlotAndTimestamp(commitment) {
        let cachedSlotData = this.slotCache[commitment];
        if (cachedSlotData == null || Date.now() - cachedSlotData.timestamp > this.SLOT_CACHE_TIME) {
            cachedSlotData = this.fetchAndSaveSlot(commitment);
        }
        return {
            slot: await cachedSlotData.slot,
            timestamp: cachedSlotData.timestamp
        };
    }
    /**
     * Gets the slot for a given commitment, uses slot cache & tries to estimate current slot based on the cached
     *  value, cache has relatively short expiry of just 12 slots (4.8 seconds)
     *
     * @param commitment
     */
    async getSlot(commitment) {
        let cachedSlotData = this.slotCache[commitment];
        if (cachedSlotData != null && Date.now() - cachedSlotData.timestamp < this.SLOT_CACHE_TIME) {
            return (await cachedSlotData.slot) + Math.floor((Date.now() - cachedSlotData.timestamp) / this.root.SLOT_TIME);
        }
        cachedSlotData = this.fetchAndSaveSlot(commitment);
        return await cachedSlotData.slot;
    }
}
exports.SolanaSlots = SolanaSlots;
