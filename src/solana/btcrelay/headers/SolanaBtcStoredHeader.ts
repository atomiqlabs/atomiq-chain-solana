import {BtcStoredHeader, StatePredictorUtils} from "@atomiqlabs/base";
import {SolanaBtcHeader} from "./SolanaBtcHeader";
import {Buffer} from "buffer";

export type SolanaBtcStoredHeaderType = {
    chainWork: number[],
    header: SolanaBtcHeader,
    lastDiffAdjustment: number,
    blockheight: number,
    prevBlockTimestamps: number[]
}

/**
 * Represents a bitcoin blockheader that has already been stored and committed in the Solana BTC relay program.
 *
 * @category BTC Relay
 */
export class SolanaBtcStoredHeader implements BtcStoredHeader<SolanaBtcHeader> {

    /**
     * Total accumulated chainwork for this header.
     */
    chainWork: number[];
    /**
     * Stored bitcoin blockheader.
     */
    header: SolanaBtcHeader;
    /**
     * Timestamp of the last difficulty adjustment.
     */
    lastDiffAdjustment: number;
    /**
     * Blockheight of the stored header.
     */
    blockheight: number;
    /**
     * Previous block timestamps tracked for median-time-past checks.
     */
    prevBlockTimestamps: number[];

    /**
     * Constructs the stored bitcoin blockheader from Solana account/event data.
     *
     * @param obj Decoded stored-header fields
     */
    constructor(obj: SolanaBtcStoredHeaderType) {
        this.chainWork = obj.chainWork;
        this.header = obj.header;
        this.lastDiffAdjustment = obj.lastDiffAdjustment;
        this.blockheight = obj.blockheight;
        this.prevBlockTimestamps = obj.prevBlockTimestamps;
    }

    /**
     * @inheritDoc
     */
    getBlockheight(): number {
        return this.blockheight;
    }

    /**
     * @inheritDoc
     */
    getChainWork(): Buffer {
        return Buffer.from(this.chainWork);
    }

    /**
     * @inheritDoc
     */
    getHeader(): SolanaBtcHeader {
        return this.header;
    }

    /**
     * @inheritDoc
     */
    getLastDiffAdjustment(): number {
        return this.lastDiffAdjustment;
    }

    /**
     * @inheritDoc
     */
    getPrevBlockTimestamps(): number[] {
        return this.prevBlockTimestamps;
    }

    /**
     * Computes prevBlockTimestamps for a next block, shifting the old block timestamps to the left & appending
     *  this block's timestamp to the end
     *
     * @private
     */
    private computeNextBlockTimestamps(): number[] {
        const prevBlockTimestamps = [...this.prevBlockTimestamps];
        for(let i=1;i<10;i++) {
            prevBlockTimestamps[i-1] = prevBlockTimestamps[i];
        }
        prevBlockTimestamps[9] = this.header.timestamp;
        return prevBlockTimestamps;
    }

    /**
     * Computes total chain work after a new header with "nbits" is added to the chain
     *
     * @param nbits
     * @private
     */
    private computeNextChainWork(nbits: number): number[] {
        const chainWork = [...this.chainWork];
        StatePredictorUtils.addInPlace(chainWork, [...StatePredictorUtils.getDifficulty(nbits)]);
        return chainWork;
    }

    /**
     * Computes lastDiffAdjustment, this changes only once every DIFF_ADJUSTMENT_PERIOD blocks
     *
     * @param headerTimestamp
     * @private
     */
    private computeNextLastDiffAdjustment(headerTimestamp: number) {
        const blockheight = this.blockheight+1;

        let lastDiffAdjustment = this.lastDiffAdjustment;
        if(blockheight % StatePredictorUtils.DIFF_ADJUSTMENT_PERIOD === 0) {
            lastDiffAdjustment = headerTimestamp;
        }

        return lastDiffAdjustment;
    }

    /**
     * @inheritDoc
     */
    computeNext(header: SolanaBtcHeader): SolanaBtcStoredHeader {
        return new SolanaBtcStoredHeader({
            chainWork: this.computeNextChainWork(header.nbits),
            prevBlockTimestamps: this.computeNextBlockTimestamps(),
            blockheight: this.blockheight+1,
            lastDiffAdjustment: this.computeNextLastDiffAdjustment(header.timestamp),
            header
        });
    }

}
