import { SolanaSwapModule } from "../SolanaSwapModule";
import { SolanaSwapData } from "../SolanaSwapData";
import { RelaySynchronizer } from "@atomiqlabs/base";
import { PublicKey } from "@solana/web3.js";
import { SolanaTx } from "../../chain/modules/SolanaTransactions";
import { SolanaBtcStoredHeader } from "../../btcrelay/headers/SolanaBtcStoredHeader";
import { SolanaBtcRelay } from "../../btcrelay/SolanaBtcRelay";
import { SolanaSwapProgram } from "../SolanaSwapProgram";
import { SolanaSigner } from "../../wallet/SolanaSigner";
import { SolanaChainInterface } from "../../chain/SolanaChainInterface";
export declare class SwapClaim extends SolanaSwapModule {
    private static readonly CUCosts;
    readonly btcRelay: SolanaBtcRelay<any>;
    /**
     * Claim action which uses the provided hex encoded secret for claiming the swap
     *
     * @param signer
     * @param swapData
     * @param secret
     * @private
     */
    private Claim;
    /**
     * Verify and claim action required for BTC on-chain swaps verified through btc relay, adds the btc relay verify
     *  instruction to the 0th index in the transaction, also intentionally sets compute budget to null such that no
     *  compute budget instruction is added, since that takes up too much space and txs are limited to 1232 bytes
     *
     * @param signer
     * @param swapData
     * @param storeDataKey
     * @param merkleProof
     * @param commitedHeader
     * @private
     */
    private VerifyAndClaim;
    constructor(chainInterface: SolanaChainInterface, program: SolanaSwapProgram, btcRelay: SolanaBtcRelay<any>);
    /**
     * Gets the compute budget required for claiming the swap
     *
     * @param swapData
     * @private
     */
    private getComputeBudget;
    /**
     * Gets committed header, identified by blockhash & blockheight, determines required BTC relay blockheight based on
     *  requiredConfirmations
     * If synchronizer is passed & blockhash is not found, it produces transactions to sync up the btc relay to the
     *  current chain tip & adds them to the txs array
     *
     * @param signer
     * @param txBlockheight transaction blockheight
     * @param requiredConfirmations required confirmation for the swap to be claimable with that TX
     * @param blockhash blockhash of the block which includes the transaction
     * @param txs solana transaction array, in case we need to synchronize the btc relay ourselves the synchronization
     *  txns are added here
     * @param synchronizer optional synchronizer to use to synchronize the btc relay in case it is not yet synchronized
     *  to the required blockheight
     * @private
     */
    private getCommitedHeaderAndSynchronize;
    /**
     * Adds the transactions required for initialization and writing of transaction data to the data account
     *
     * @param signer
     * @param tx transaction to be written
     * @param vout vout of the transaction to use to satisfy swap conditions
     * @param feeRate fee rate for the transactions
     * @param txs solana transaction array, init & write transactions are added here
     * @private
     * @returns {Promise<PublicKey>} publicKey/address of the data account
     */
    private addTxsWriteTransactionData;
    /**
     * Checks whether we should unwrap the WSOL to SOL when claiming the swap
     *
     * @param signer
     * @param swapData
     * @private
     */
    private shouldUnwrap;
    /**
     * Creates transactions claiming the swap using a secret (for HTLC swaps)
     *
     * @param signer
     * @param swapData swap to claim
     * @param secret hex encoded secret pre-image to the HTLC hash
     * @param checkExpiry whether to check if the swap is already expired (trying to claim an expired swap with a secret
     *  is dangerous because we might end up revealing the secret to the counterparty without being able to claim the swap)
     * @param initAta whether to init the claimer's ATA if it doesn't exist
     * @param feeRate fee rate to use for the transaction
     * @param skipAtaCheck whether to check if ATA exists
     */
    txsClaimWithSecret(signer: PublicKey, swapData: SolanaSwapData, secret: string, checkExpiry?: boolean, initAta?: boolean, feeRate?: string, skipAtaCheck?: boolean): Promise<SolanaTx[]>;
    /**
     * Creates transaction claiming the swap using a confirmed transaction data (for BTC on-chain swaps)
     *
     * @param signer
     * @param swapData swap to claim
     * @param tx bitcoin transaction that satisfies the swap condition
     * @param vout vout of the bitcoin transaction that satisfies the swap condition
     * @param commitedHeader commited header data from btc relay (fetched internally if null)
     * @param synchronizer optional synchronizer to use in case we need to sync up the btc relay ourselves
     * @param initAta whether to initialize claimer's ATA
     * @param feeRate fee rate to be used for the transactions
     */
    txsClaimWithTxData(signer: PublicKey | SolanaSigner, swapData: SolanaSwapData, tx: {
        blockhash: string;
        txid: string;
        hex: string;
        height: number;
    }, vout: number, commitedHeader?: SolanaBtcStoredHeader | null, synchronizer?: RelaySynchronizer<any, SolanaTx, any>, initAta?: boolean, feeRate?: string): Promise<{
        txs: SolanaTx[];
        claimTxIndex: number;
        storageAcc: PublicKey;
    }>;
    getClaimFeeRate(signer: PublicKey, swapData: SolanaSwapData): Promise<string>;
    /**
     * Get the estimated solana transaction fee of the claim transaction in the worst case scenario in case where the
     *  ATA needs to be initialized again (i.e. adding the ATA rent exempt lamports to the fee)
     */
    getClaimFee(signer: PublicKey, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * Get the estimated solana transaction fee of the claim transaction, without
     */
    getRawClaimFee(signer: PublicKey, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
}
