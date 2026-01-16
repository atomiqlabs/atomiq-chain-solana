/// <reference types="node" />
import { BtcStoredHeader } from "@atomiqlabs/base";
import { SolanaBtcHeader } from "./SolanaBtcHeader";
import { Buffer } from "buffer";
export type SolanaBtcStoredHeaderType = {
    chainWork: number[];
    header: SolanaBtcHeader;
    lastDiffAdjustment: number;
    blockheight: number;
    prevBlockTimestamps: number[];
};
/**
 * @category BTC Relay
 */
export declare class SolanaBtcStoredHeader implements BtcStoredHeader<SolanaBtcHeader> {
    chainWork: number[];
    header: SolanaBtcHeader;
    lastDiffAdjustment: number;
    blockheight: number;
    prevBlockTimestamps: number[];
    constructor(obj: SolanaBtcStoredHeaderType);
    getBlockheight(): number;
    getChainWork(): Buffer;
    getHeader(): SolanaBtcHeader;
    getLastDiffAdjustment(): number;
    getPrevBlockTimestamps(): number[];
    /**
     * Computes prevBlockTimestamps for a next block, shifting the old block timestamps to the left & appending
     *  this block's timestamp to the end
     *
     * @private
     */
    private computeNextBlockTimestamps;
    /**
     * Computes total chain work after a new header with "nbits" is added to the chain
     *
     * @param nbits
     * @private
     */
    private computeNextChainWork;
    /**
     * Computes lastDiffAdjustment, this changes only once every DIFF_ADJUSTMENT_PERIOD blocks
     *
     * @param headerTimestamp
     * @private
     */
    private computeNextLastDiffAdjustment;
    computeNext(header: SolanaBtcHeader): SolanaBtcStoredHeader;
}
