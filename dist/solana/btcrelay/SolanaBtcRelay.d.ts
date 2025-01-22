/// <reference types="node" />
import { Connection, PublicKey, Signer, Transaction } from "@solana/web3.js";
import { SolanaBtcStoredHeader } from "./headers/SolanaBtcStoredHeader";
import { BitcoinRpc, BtcBlock, BtcRelay } from "@atomiqlabs/base";
import { SolanaProgramBase } from "../program/SolanaProgramBase";
import * as BN from "bn.js";
import { SolanaAction } from "../base/SolanaAction";
import { Buffer } from "buffer";
import { SolanaFees } from "../base/modules/SolanaFees";
import { SolanaSigner } from "../wallet/SolanaSigner";
export declare class SolanaBtcRelay<B extends BtcBlock> extends SolanaProgramBase<any> implements BtcRelay<SolanaBtcStoredHeader, {
    tx: Transaction;
    signers: Signer[];
}, B, SolanaSigner> {
    /**
     * Creates initialization action for initializing the btc relay
     *
     * @param signer
     * @param header
     * @param epochStart
     * @param pastBlocksTimestamps
     * @constructor
     * @private
     */
    private Initialize;
    /**
     * Creates verify action to be used with the swap program, specifies the action to be firstIxBeforeComputeBudget,
     *  such that the verify instruction will always be the 0th in the transaction, this is required because
     *  swap program expects the verify instruction to be at the 0th position
     *
     * @param signer
     * @param reversedTxId
     * @param confirmations
     * @param position
     * @param reversedMerkleProof
     * @param committedHeader
     */
    Verify(signer: PublicKey, reversedTxId: Buffer, confirmations: number, position: number, reversedMerkleProof: Buffer[], committedHeader: SolanaBtcStoredHeader): Promise<SolanaAction>;
    CloseForkAccount(signer: PublicKey, forkId: number): Promise<SolanaAction>;
    BtcRelayMainState: PublicKey;
    BtcRelayHeader: (hash: Buffer) => PublicKey;
    BtcRelayFork: (forkId: number, pubkey: PublicKey) => PublicKey;
    bitcoinRpc: BitcoinRpc<B>;
    readonly maxHeadersPerTx: number;
    readonly maxForkHeadersPerTx: number;
    readonly maxShortForkHeadersPerTx: number;
    constructor(connection: Connection, bitcoinRpc: BitcoinRpc<B>, programAddress?: string, solanaFeeEstimator?: SolanaFees);
    /**
     * Gets set of block commitments representing current main chain from the mainState
     *
     * @param mainState
     * @private
     */
    private getBlockCommitmentsSet;
    /**
     * Computes subsequent commited headers as they will appear on the blockchain when transactions
     *  are submitted & confirmed
     *
     * @param initialStoredHeader
     * @param syncedHeaders
     * @private
     */
    private computeCommitedHeaders;
    /**
     * A common logic for submitting blockheaders in a transaction
     *
     * @param signer
     * @param headers headers to sync to the btc relay
     * @param storedHeader current latest stored block header for a given fork
     * @param tipWork work of the current tip in a given fork
     * @param forkId forkId to submit to, forkId=0 means main chain
     * @param feeRate feeRate for the transaction
     * @param createTx transaction generator function
     * @private
     */
    private _saveHeaders;
    /**
     * Returns data about current main chain tip stored in the btc relay
     */
    getTipData(): Promise<{
        commitHash: string;
        blockhash: string;
        chainWork: Buffer;
        blockheight: number;
    }>;
    /**
     * Retrieves blockheader with a specific blockhash, returns null if requiredBlockheight is provided and
     *  btc relay contract is not synced up to the desired blockheight
     *
     * @param blockData
     * @param requiredBlockheight
     */
    retrieveLogAndBlockheight(blockData: {
        blockhash: string;
    }, requiredBlockheight?: number): Promise<{
        header: SolanaBtcStoredHeader;
        height: number;
    } | null>;
    /**
     * Retrieves blockheader data by blockheader's commit hash,
     *
     * @param commitmentHashStr
     * @param blockData
     */
    retrieveLogByCommitHash(commitmentHashStr: string, blockData: {
        blockhash: string;
    }): Promise<SolanaBtcStoredHeader>;
    /**
     * Retrieves latest known stored blockheader & blockheader from bitcoin RPC that is in the main chain
     */
    retrieveLatestKnownBlockLog(): Promise<{
        resultStoredHeader: SolanaBtcStoredHeader;
        resultBitcoinHeader: B;
    }>;
    /**
     * Saves initial block header when the btc relay is in uninitialized state
     *
     * @param signer
     * @param header a bitcoin blockheader to submit
     * @param epochStart timestamp of the start of the epoch (block timestamp at blockheight-(blockheight%2016))
     * @param pastBlocksTimestamps timestamp of the past 10 blocks
     * @param feeRate fee rate to use for the transaction
     */
    saveInitialHeader(signer: string, header: B, epochStart: number, pastBlocksTimestamps: number[], feeRate?: string): Promise<{
        tx: Transaction;
        signers: Signer[];
    }>;
    /**
     * Saves blockheaders as a bitcoin main chain to the btc relay
     *
     * @param signer
     * @param mainHeaders
     * @param storedHeader
     * @param feeRate
     */
    saveMainHeaders(signer: string, mainHeaders: BtcBlock[], storedHeader: SolanaBtcStoredHeader, feeRate?: string): Promise<{
        forkId: number;
        lastStoredHeader: SolanaBtcStoredHeader;
        tx: {
            tx: Transaction;
            signers: any[];
        };
        computedCommitedHeaders: SolanaBtcStoredHeader[];
    }>;
    /**
     * Creates a new long fork and submits the headers to it
     *
     * @param signer
     * @param forkHeaders
     * @param storedHeader
     * @param tipWork
     * @param feeRate
     */
    saveNewForkHeaders(signer: string, forkHeaders: BtcBlock[], storedHeader: SolanaBtcStoredHeader, tipWork: Buffer, feeRate?: string): Promise<{
        forkId: number;
        lastStoredHeader: SolanaBtcStoredHeader;
        tx: {
            tx: Transaction;
            signers: any[];
        };
        computedCommitedHeaders: SolanaBtcStoredHeader[];
    }>;
    /**
     * Continues submitting blockheaders to a given fork
     *
     * @param signer
     * @param forkHeaders
     * @param storedHeader
     * @param forkId
     * @param tipWork
     * @param feeRate
     */
    saveForkHeaders(signer: string, forkHeaders: BtcBlock[], storedHeader: SolanaBtcStoredHeader, forkId: number, tipWork: Buffer, feeRate?: string): Promise<{
        forkId: number;
        lastStoredHeader: SolanaBtcStoredHeader;
        tx: {
            tx: Transaction;
            signers: any[];
        };
        computedCommitedHeaders: SolanaBtcStoredHeader[];
    }>;
    /**
     * Submits short fork with given blockheaders
     *
     * @param signer
     * @param forkHeaders
     * @param storedHeader
     * @param tipWork
     * @param feeRate
     */
    saveShortForkHeaders(signer: string, forkHeaders: BtcBlock[], storedHeader: SolanaBtcStoredHeader, tipWork: Buffer, feeRate?: string): Promise<{
        forkId: number;
        lastStoredHeader: SolanaBtcStoredHeader;
        tx: {
            tx: Transaction;
            signers: any[];
        };
        computedCommitedHeaders: SolanaBtcStoredHeader[];
    }>;
    /**
     * Sweeps fork data PDAs back to self
     *
     * @param signer
     * @param lastSweepId lastCheckedId returned from the previous sweepForkData() call
     * @returns {number} lastCheckedId that should be passed to the next call of sweepForkData()
     */
    sweepForkData(signer: SolanaSigner, lastSweepId?: number): Promise<number | null>;
    /**
     * Estimate required synchronization fee (worst case) to synchronize btc relay to the required blockheight
     *
     * @param requiredBlockheight
     * @param feeRate
     */
    estimateSynchronizeFee(requiredBlockheight: number, feeRate?: string): Promise<BN>;
    /**
     * Returns fee required (in SOL) to synchronize a single block to btc relay
     *
     * @param feeRate
     */
    getFeePerBlock(feeRate?: string): Promise<BN>;
    /**
     * Gets fee rate required for submitting blockheaders to the main chain
     */
    getMainFeeRate(signer: string | null): Promise<string>;
    /**
     * Gets fee rate required for submitting blockheaders to the specific fork
     */
    getForkFeeRate(signer: string, forkId: number): Promise<string>;
}
