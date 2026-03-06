"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaBtcStoredHeader = void 0;
const base_1 = require("@atomiqlabs/base");
const buffer_1 = require("buffer");
/**
 * Represents a bitcoin blockheader that has already been stored and committed in the Solana BTC relay program.
 *
 * @category BTC Relay
 */
class SolanaBtcStoredHeader {
    /**
     * Constructs the stored bitcoin blockheader from Solana account/event data.
     *
     * @param obj Decoded stored-header fields
     */
    constructor(obj) {
        this.chainWork = obj.chainWork;
        this.header = obj.header;
        this.lastDiffAdjustment = obj.lastDiffAdjustment;
        this.blockheight = obj.blockheight;
        this.prevBlockTimestamps = obj.prevBlockTimestamps;
    }
    /**
     * @inheritDoc
     */
    getBlockheight() {
        return this.blockheight;
    }
    /**
     * @inheritDoc
     */
    getChainWork() {
        return buffer_1.Buffer.from(this.chainWork);
    }
    /**
     * @inheritDoc
     */
    getHeader() {
        return this.header;
    }
    /**
     * @inheritDoc
     */
    getLastDiffAdjustment() {
        return this.lastDiffAdjustment;
    }
    /**
     * @inheritDoc
     */
    getPrevBlockTimestamps() {
        return this.prevBlockTimestamps;
    }
    /**
     * Computes prevBlockTimestamps for a next block, shifting the old block timestamps to the left & appending
     *  this block's timestamp to the end
     *
     * @private
     */
    computeNextBlockTimestamps() {
        const prevBlockTimestamps = [...this.prevBlockTimestamps];
        for (let i = 1; i < 10; i++) {
            prevBlockTimestamps[i - 1] = prevBlockTimestamps[i];
        }
        prevBlockTimestamps[9] = this.header.getTimestamp();
        return prevBlockTimestamps;
    }
    /**
     * Computes total chain work after a new header with "nbits" is added to the chain
     *
     * @param nbits
     * @private
     */
    computeNextChainWork(nbits) {
        const chainWork = [...this.chainWork];
        base_1.StatePredictorUtils.addInPlace(chainWork, [...base_1.StatePredictorUtils.getDifficulty(nbits)]);
        return chainWork;
    }
    /**
     * Computes lastDiffAdjustment, this changes only once every DIFF_ADJUSTMENT_PERIOD blocks
     *
     * @param headerTimestamp
     * @private
     */
    computeNextLastDiffAdjustment(headerTimestamp) {
        const blockheight = this.blockheight + 1;
        let lastDiffAdjustment = this.lastDiffAdjustment;
        if (blockheight % base_1.StatePredictorUtils.DIFF_ADJUSTMENT_PERIOD === 0) {
            lastDiffAdjustment = headerTimestamp;
        }
        return lastDiffAdjustment;
    }
    /**
     * @inheritDoc
     */
    computeNext(header) {
        return new SolanaBtcStoredHeader({
            chainWork: this.computeNextChainWork(header.getNbits()),
            prevBlockTimestamps: this.computeNextBlockTimestamps(),
            blockheight: this.blockheight + 1,
            lastDiffAdjustment: this.computeNextLastDiffAdjustment(header.getTimestamp()),
            header
        });
    }
}
exports.SolanaBtcStoredHeader = SolanaBtcStoredHeader;
