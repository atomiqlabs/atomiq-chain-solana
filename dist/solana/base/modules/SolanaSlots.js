"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
    getSlotAndTimestamp(commitment) {
        return __awaiter(this, void 0, void 0, function* () {
            let cachedSlotData = this.slotCache[commitment];
            if (cachedSlotData == null || Date.now() - cachedSlotData.timestamp > this.SLOT_CACHE_TIME) {
                cachedSlotData = this.fetchAndSaveSlot(commitment);
            }
            return {
                slot: yield cachedSlotData.slot,
                timestamp: cachedSlotData.timestamp
            };
        });
    }
    /**
     * Gets the slot for a given commitment, uses slot cache & tries to estimate current slot based on the cached
     *  value, cache has relatively short expiry of just 12 slots (4.8 seconds)
     *
     * @param commitment
     */
    getSlot(commitment) {
        return __awaiter(this, void 0, void 0, function* () {
            let cachedSlotData = this.slotCache[commitment];
            if (cachedSlotData != null && Date.now() - cachedSlotData.timestamp < this.SLOT_CACHE_TIME) {
                return (yield cachedSlotData.slot) + Math.floor((Date.now() - cachedSlotData.timestamp) / this.root.SLOT_TIME);
            }
            cachedSlotData = this.fetchAndSaveSlot(commitment);
            return yield cachedSlotData.slot;
        });
    }
}
exports.SolanaSlots = SolanaSlots;
