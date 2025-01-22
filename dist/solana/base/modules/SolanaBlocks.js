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
exports.SolanaBlocks = void 0;
const SolanaModule_1 = require("../SolanaModule");
class SolanaBlocks extends SolanaModule_1.SolanaModule {
    constructor() {
        super(...arguments);
        this.blockCache = new Map();
    }
    /**
     * Initiates a fetch of the block at specified slot & saves the fetch promise into a block cache
     *
     * @param slot
     * @private
     */
    fetchAndSaveParsedBlock(slot) {
        const blockCacheData = this.connection.getParsedBlock(slot, {
            transactionDetails: "none",
            commitment: "confirmed",
            rewards: false
        });
        this.blockCache.set(slot, blockCacheData);
        blockCacheData.catch(e => {
            if (this.blockCache.get(slot) == blockCacheData)
                this.blockCache.delete(slot);
            throw e;
        });
        return blockCacheData;
    }
    ///////////////////
    //// Blocks
    /**
     * Tries to find the latest existing block for a given commitment, skipping blocks that are not available, runs a
     *  search backwards from the latest slot for the given commitment and fails after 10 tries
     *
     * @param commitment
     */
    findLatestParsedBlock(commitment) {
        return __awaiter(this, void 0, void 0, function* () {
            let slot = yield this.root.Slots.getSlot(commitment);
            for (let i = 0; i < 10; i++) {
                const block = yield this.getParsedBlock(slot).catch(e => {
                    if (e.toString().startsWith("SolanaJSONRPCError: failed to get block: Block not available for slot")) {
                        return null;
                    }
                    throw e;
                });
                if (block != null) {
                    this.logger.debug("findLatestParsedBlock(): Found valid block, slot: " + slot +
                        " blockhash: " + block.blockhash + " tries: " + i);
                    return {
                        block,
                        slot
                    };
                }
                slot--;
            }
            throw new Error("Ran out of tries trying to find a parsedBlock");
        });
    }
    /**
     * Gets parsed block for a given slot, uses block cache if the block was already fetched before
     *
     * @param slot
     */
    getParsedBlock(slot) {
        let blockCacheData = this.blockCache.get(slot);
        if (blockCacheData == null) {
            blockCacheData = this.fetchAndSaveParsedBlock(slot);
        }
        return blockCacheData;
    }
}
exports.SolanaBlocks = SolanaBlocks;
