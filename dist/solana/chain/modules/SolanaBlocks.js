"use strict";
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
        }).then(val => {
            if (val.blockHeight == null || val.blockTime == null)
                throw new Error(`Cannot get block for slot ${slot}: blockHeight or blockTime empty!`);
            return val;
        });
        this.blockCache.set(slot, blockCacheData);
        blockCacheData.catch(() => {
            if (this.blockCache.get(slot) == blockCacheData)
                this.blockCache.delete(slot);
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
    async findLatestParsedBlock(commitment) {
        let slot = await this.root.Slots.getSlot(commitment);
        for (let i = 0; i < 10; i++) {
            const block = await this.getParsedBlock(slot).catch(e => {
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
