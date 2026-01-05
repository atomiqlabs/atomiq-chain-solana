/// <reference types="node" />
import { SolanaSwapData } from "./SolanaSwapData";
import { PublicKey } from "@solana/web3.js";
import { SolanaBtcRelay } from "../btcrelay/SolanaBtcRelay";
import { IStorageManager, SwapContract, ChainSwapType, IntermediaryReputationType, TransactionConfirmationOptions, SignatureData, RelaySynchronizer, SwapCommitState, SwapCommitStateType } from "@atomiqlabs/base";
import { SolanaBtcStoredHeader } from "../btcrelay/headers/SolanaBtcStoredHeader";
import { SwapProgram } from "./programTypes";
import { SolanaChainInterface } from "../chain/SolanaChainInterface";
import { SolanaProgramBase } from "../program/SolanaProgramBase";
import { SolanaTx } from "../chain/modules/SolanaTransactions";
import { SwapInit, SolanaPreFetchData, SolanaPreFetchVerification } from "./modules/SwapInit";
import { SolanaDataAccount, StoredDataAccount } from "./modules/SolanaDataAccount";
import { SwapRefund } from "./modules/SwapRefund";
import { SwapClaim } from "./modules/SwapClaim";
import { SolanaLpVault } from "./modules/SolanaLpVault";
import { Buffer } from "buffer";
import { SolanaSigner } from "../wallet/SolanaSigner";
export declare class SolanaSwapProgram extends SolanaProgramBase<SwapProgram> implements SwapContract<SolanaSwapData, SolanaTx, SolanaPreFetchData, SolanaPreFetchVerification, SolanaSigner, "SOLANA"> {
    readonly ESCROW_STATE_RENT_EXEMPT = 2658720;
    readonly SwapVaultAuthority: PublicKey;
    readonly SwapVault: (tokenAddress: PublicKey) => PublicKey;
    readonly SwapUserVault: (publicKey: PublicKey, tokenAddress: PublicKey) => PublicKey;
    readonly SwapEscrowState: (hash: Buffer) => PublicKey;
    readonly chainId: "SOLANA";
    readonly claimWithSecretTimeout: number;
    readonly claimWithTxDataTimeout: number;
    readonly refundTimeout: number;
    readonly claimGracePeriod: number;
    readonly refundGracePeriod: number;
    readonly authGracePeriod: number;
    readonly Init: SwapInit;
    readonly Refund: SwapRefund;
    readonly Claim: SwapClaim;
    readonly DataAccount: SolanaDataAccount;
    readonly LpVault: SolanaLpVault;
    constructor(chainInterface: SolanaChainInterface, btcRelay: SolanaBtcRelay<any>, storage: IStorageManager<StoredDataAccount>, programAddress?: string);
    start(): Promise<void>;
    getClaimableDeposits(signer: string): Promise<{
        count: number;
        totalValue: bigint;
    }>;
    claimDeposits(signer: SolanaSigner): Promise<{
        txIds: string[];
        count: number;
        totalValue: bigint;
    }>;
    preFetchForInitSignatureVerification(data: SolanaPreFetchData): Promise<SolanaPreFetchVerification>;
    preFetchBlockDataForSignatures(): Promise<SolanaPreFetchData>;
    getInitSignature(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number, preFetchedBlockData?: SolanaPreFetchData, feeRate?: string): Promise<SignatureData>;
    isValidInitAuthorization(signer: string, swapData: SolanaSwapData, { timeout, prefix, signature }: {
        timeout: any;
        prefix: any;
        signature: any;
    }, feeRate?: string, preFetchedData?: SolanaPreFetchVerification): Promise<Buffer>;
    getInitAuthorizationExpiry(swapData: SolanaSwapData, { timeout, prefix, signature }: {
        timeout: any;
        prefix: any;
        signature: any;
    }, preFetchedData?: SolanaPreFetchVerification): Promise<number>;
    isInitAuthorizationExpired(swapData: SolanaSwapData, { timeout, prefix, signature }: {
        timeout: any;
        prefix: any;
        signature: any;
    }): Promise<boolean>;
    getRefundSignature(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number): Promise<SignatureData>;
    isValidRefundAuthorization(swapData: SolanaSwapData, { timeout, prefix, signature }: {
        timeout: any;
        prefix: any;
        signature: any;
    }): Promise<Buffer>;
    getDataSignature(signer: SolanaSigner, data: Buffer): Promise<string>;
    isValidDataSignature(data: Buffer, signature: string, publicKey: string): Promise<boolean>;
    /**
     * Checks whether the claim is claimable by us, that means not expired, we are claimer & the swap is commited
     *
     * @param signer
     * @param data
     */
    isClaimable(signer: string, data: SolanaSwapData): Promise<boolean>;
    /**
     * Checks whether a swap is commited, i.e. the swap still exists on-chain and was not claimed nor refunded
     *
     * @param swapData
     */
    isCommited(swapData: SolanaSwapData): Promise<boolean>;
    /**
     * Checks whether the swap is expired, takes into consideration possible on-chain time skew, therefore for claimer
     *  the swap expires a bit sooner than it should've & for the offerer it expires a bit later
     *
     * @param signer
     * @param data
     */
    isExpired(signer: string, data: SolanaSwapData): Promise<boolean>;
    /**
     * Checks if the swap is refundable by us, checks if we are offerer, if the swap is already expired & if the swap
     *  is still commited
     *
     * @param signer
     * @param data
     */
    isRequestRefundable(signer: string, data: SolanaSwapData): Promise<boolean>;
    /**
     * Get the swap payment hash to be used for an on-chain swap, this just uses a sha256 hash of the values
     *
     * @param outputScript output script required to claim the swap
     * @param amount sats sent required to claim the swap
     * @param confirmations
     * @param nonce swap nonce uniquely identifying the transaction to prevent replay attacks
     */
    getHashForOnchain(outputScript: Buffer, amount: bigint, confirmations: number, nonce?: bigint): Buffer;
    getHashForHtlc(swapHash: Buffer): Buffer;
    getHashForTxId(txId: string, confirmations: number): Buffer;
    /**
     * Gets the status of the specific swap, this also checks if we are offerer/claimer & checks for expiry (to see
     *  if swap is refundable)
     *
     * @param signer
     * @param data
     */
    getCommitStatus(signer: string, data: SolanaSwapData): Promise<SwapCommitState>;
    getCommitStatuses(request: {
        signer: string;
        swapData: SolanaSwapData;
    }[]): Promise<{
        [p: string]: SwapCommitState;
    }>;
    /**
     * Checks the status of the specific payment hash
     *
     * @param claimHash
     */
    getClaimHashStatus(claimHash: string): Promise<SwapCommitStateType>;
    /**
     * Returns the data committed for a specific payment hash, or null if no data is currently commited for
     *  the specific swap
     *
     * @param claimHashHex
     */
    getCommitedData(claimHashHex: string): Promise<SolanaSwapData>;
    getHistoricalSwaps(signer: string, startBlockheight?: number): Promise<{
        swaps: {
            [p: string]: {
                data?: SolanaSwapData;
                state: SwapCommitState;
            };
        };
        latestBlockheight: number;
    }>;
    createSwapData(type: ChainSwapType, offerer: string, claimer: string, token: string, amount: bigint, claimHash: string, sequence: bigint, expiry: bigint, payIn: boolean, payOut: boolean, securityDeposit: bigint, claimerBounty: bigint, depositToken?: string): Promise<SolanaSwapData>;
    getBalance(signer: string, tokenAddress: string, inContract: boolean): Promise<bigint>;
    getIntermediaryData(address: string, token: string): Promise<{
        balance: bigint;
        reputation: IntermediaryReputationType;
    }>;
    getIntermediaryReputation(address: string, token: string): Promise<IntermediaryReputationType>;
    getIntermediaryBalance(address: PublicKey, token: PublicKey): Promise<bigint>;
    txsClaimWithSecret(signer: string | SolanaSigner, swapData: SolanaSwapData, secret: string, checkExpiry?: boolean, initAta?: boolean, feeRate?: string, skipAtaCheck?: boolean): Promise<SolanaTx[]>;
    txsClaimWithTxData(signer: string | SolanaSigner, swapData: SolanaSwapData, tx: {
        blockhash: string;
        confirmations: number;
        txid: string;
        hex: string;
        height: number;
    }, requiredConfirmations: number, vout: number, commitedHeader?: SolanaBtcStoredHeader, synchronizer?: RelaySynchronizer<any, SolanaTx, any>, initAta?: boolean, feeRate?: string, storageAccHolder?: {
        storageAcc: PublicKey;
    }): Promise<SolanaTx[] | null>;
    txsRefund(signer: string, swapData: SolanaSwapData, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    txsRefundWithAuthorization(signer: string, swapData: SolanaSwapData, { timeout, prefix, signature }: {
        timeout: any;
        prefix: any;
        signature: any;
    }, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    txsInit(sender: string, swapData: SolanaSwapData, { timeout, prefix, signature }: {
        timeout: any;
        prefix: any;
        signature: any;
    }, skipChecks?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    txsWithdraw(signer: string, token: string, amount: bigint, feeRate?: string): Promise<SolanaTx[]>;
    txsDeposit(signer: string, token: string, amount: bigint, feeRate?: string): Promise<SolanaTx[]>;
    claimWithSecret(signer: SolanaSigner, swapData: SolanaSwapData, secret: string, checkExpiry?: boolean, initAta?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    claimWithTxData(signer: SolanaSigner, swapData: SolanaSwapData, tx: {
        blockhash: string;
        confirmations: number;
        txid: string;
        hex: string;
        height: number;
    }, requiredConfirmations: number, vout: number, commitedHeader?: SolanaBtcStoredHeader, synchronizer?: RelaySynchronizer<any, SolanaTx, any>, initAta?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    refund(signer: SolanaSigner, swapData: SolanaSwapData, check?: boolean, initAta?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    refundWithAuthorization(signer: SolanaSigner, swapData: SolanaSwapData, signature: SignatureData, check?: boolean, initAta?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    init(signer: SolanaSigner, swapData: SolanaSwapData, signature: SignatureData, skipChecks?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    initAndClaimWithSecret(signer: SolanaSigner, swapData: SolanaSwapData, signature: SignatureData, secret: string, skipChecks?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string[]>;
    withdraw(signer: SolanaSigner, token: string, amount: bigint, txOptions?: TransactionConfirmationOptions): Promise<string>;
    deposit(signer: SolanaSigner, token: string, amount: bigint, txOptions?: TransactionConfirmationOptions): Promise<string>;
    getInitPayInFeeRate(offerer?: string, claimer?: string, token?: string, claimHash?: string): Promise<string>;
    getInitFeeRate(offerer?: string, claimer?: string, token?: string, claimHash?: string): Promise<string>;
    getRefundFeeRate(swapData: SolanaSwapData): Promise<string>;
    getClaimFeeRate(signer: string, swapData: SolanaSwapData): Promise<string>;
    getClaimFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    getRawClaimFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * Get the estimated solana fee of the commit transaction
     */
    getCommitFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * Get the estimated solana fee of the commit transaction, without any deposits
     */
    getRawCommitFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRefundFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRawRefundFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    getExtraData(outputScript: Buffer, amount: bigint, confirmations: number, nonce?: bigint): Buffer;
}
