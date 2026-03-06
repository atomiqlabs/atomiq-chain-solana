/// <reference types="node" />
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
 * Represents a bitcoin blockheader that has already been stored and committed in the Solana BTC relay program.
 *
 * @category BTC Relay
 */
export declare class SolanaBtcStoredHeader implements BtcStoredHeader<SolanaBtcHeader> {
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
    constructor(obj: SolanaBtcStoredHeaderType);
    /**
     * @inheritDoc
     */
    getBlockheight(): number;
    /**
     * @inheritDoc
     */
    getChainWork(): Buffer;
    /**
     * @inheritDoc
     */
    getHeader(): SolanaBtcHeader;
    /**
     * @inheritDoc
     */
    getLastDiffAdjustment(): number;
    /**
     * @inheritDoc
     */
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
    /**
     * @inheritDoc
     */
    computeNext(header: SolanaBtcHeader): SolanaBtcStoredHeader;
}
