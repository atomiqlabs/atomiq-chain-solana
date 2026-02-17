/// <reference types="node" />
/// <reference types="node" />
import { PublicKey, Signer, Transaction } from "@solana/web3.js";
import { SolanaBtcStoredHeader } from "./headers/SolanaBtcStoredHeader";
import { BitcoinRpc, BtcBlock, BtcRelay } from "@atomiqlabs/base";
import { SolanaProgramBase } from "../program/SolanaProgramBase";
import { SolanaAction } from "../chain/SolanaAction";
import { Buffer } from "buffer";
import { SolanaSigner } from "../wallet/SolanaSigner";
import { SolanaChainInterface } from "../chain/SolanaChainInterface";
/**
 * @category BTC Relay
 */
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
    constructor(chainInterface: SolanaChainInterface, bitcoinRpc: BitcoinRpc<B>, programAddress?: string);
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
     * @param forkId forkId to submit to, forkId=0 means main chain
     * @param feeRate feeRate for the transaction
     * @param createTx transaction generator function
     * @private
     */
    private _saveHeaders;
    /**
     * @inheritDoc
     */
    getTipData(): Promise<{
        commitHash: string;
        blockhash: string;
        chainWork: Buffer;
        blockheight: number;
    } | null>;
    /**
     * @inheritDoc
     */
    retrieveLogAndBlockheight(blockData: {
        blockhash: string;
    }, requiredBlockheight?: number): Promise<{
        header: SolanaBtcStoredHeader;
        height: number;
    } | null>;
    /**
     * @inheritDoc
     */
    retrieveLogByCommitHash(commitmentHashStr: string, blockData: {
        blockhash: string;
    }): Promise<SolanaBtcStoredHeader | null>;
    /**
     * @inheritDoc
     */
    retrieveLatestKnownBlockLog(): Promise<{
        resultStoredHeader: SolanaBtcStoredHeader;
        resultBitcoinHeader: B;
    } | null>;
    /**
     * @inheritDoc
     */
    saveInitialHeader(signer: string, header: B, epochStart: number, pastBlocksTimestamps: number[], feeRate?: string): Promise<{
        tx: Transaction;
        signers: Signer[];
    }>;
    /**
     * @inheritDoc
     */
    saveMainHeaders(signer: string, mainHeaders: BtcBlock[], storedHeader: SolanaBtcStoredHeader, feeRate?: string): Promise<{
        forkId: number;
        lastStoredHeader: SolanaBtcStoredHeader;
        tx: {
            tx: Transaction;
            signers: never[];
        };
        computedCommitedHeaders: SolanaBtcStoredHeader[];
    }>;
    /**
     * @inheritDoc
     */
    saveNewForkHeaders(signer: string, forkHeaders: BtcBlock[], storedHeader: SolanaBtcStoredHeader, tipWork: Buffer, feeRate?: string): Promise<{
        forkId: number;
        lastStoredHeader: SolanaBtcStoredHeader;
        tx: {
            tx: Transaction;
            signers: never[];
        };
        computedCommitedHeaders: SolanaBtcStoredHeader[];
    }>;
    /**
     * @inheritDoc
     */
    saveForkHeaders(signer: string, forkHeaders: BtcBlock[], storedHeader: SolanaBtcStoredHeader, forkId: number, tipWork: Buffer, feeRate?: string): Promise<{
        forkId: number;
        lastStoredHeader: SolanaBtcStoredHeader;
        tx: {
            tx: Transaction;
            signers: never[];
        };
        computedCommitedHeaders: SolanaBtcStoredHeader[];
    }>;
    /**
     * @inheritDoc
     */
    saveShortForkHeaders(signer: string, forkHeaders: BtcBlock[], storedHeader: SolanaBtcStoredHeader, tipWork: Buffer, feeRate?: string): Promise<{
        forkId: number;
        lastStoredHeader: SolanaBtcStoredHeader;
        tx: {
            tx: Transaction;
            signers: never[];
        };
        computedCommitedHeaders: SolanaBtcStoredHeader[];
    }>;
    /**
     * @inheritDoc
     */
    sweepForkData(signer: SolanaSigner, lastSweepId?: number): Promise<number | null>;
    /**
     * @inheritDoc
     */
    estimateSynchronizeFee(requiredBlockheight: number, feeRate?: string): Promise<bigint>;
    /**
     * @inheritDoc
     */
    getFeePerBlock(feeRate?: string): Promise<bigint>;
    /**
     * @inheritDoc
     */
    getMainFeeRate(signer: string | null): Promise<string>;
    /**
     * @inheritDoc
     */
    getForkFeeRate(signer: string, forkId: number): Promise<string>;
}
