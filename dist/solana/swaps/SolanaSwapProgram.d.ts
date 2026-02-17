/// <reference types="node" />
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
/**
 * @category Swaps
 */
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
    /**
     * @inheritDoc
     */
    start(): Promise<void>;
    /**
     * @inheritDoc
     */
    getClaimableDeposits(signer: string): Promise<{
        count: number;
        totalValue: bigint;
    }>;
    /**
     * @inheritDoc
     */
    claimDeposits(signer: SolanaSigner): Promise<{
        txIds: string[];
        count: number;
        totalValue: bigint;
    }>;
    /**
     * @inheritDoc
     */
    preFetchForInitSignatureVerification(data: SolanaPreFetchData): Promise<SolanaPreFetchVerification>;
    /**
     * @inheritDoc
     */
    preFetchBlockDataForSignatures(): Promise<SolanaPreFetchData>;
    /**
     * @inheritDoc
     */
    getInitSignature(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number, preFetchedBlockData?: SolanaPreFetchData, feeRate?: string): Promise<SignatureData>;
    /**
     * @inheritDoc
     */
    isValidInitAuthorization(signer: string, swapData: SolanaSwapData, sig: SignatureData, feeRate?: string, preFetchedData?: SolanaPreFetchVerification): Promise<Buffer>;
    /**
     * @inheritDoc
     */
    getInitAuthorizationExpiry(swapData: SolanaSwapData, sig: SignatureData, preFetchedData?: SolanaPreFetchVerification): Promise<number>;
    /**
     * @inheritDoc
     */
    isInitAuthorizationExpired(swapData: SolanaSwapData, sig: SignatureData): Promise<boolean>;
    /**
     * @inheritDoc
     */
    getRefundSignature(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number): Promise<SignatureData>;
    /**
     * @inheritDoc
     */
    isValidRefundAuthorization(swapData: SolanaSwapData, sig: SignatureData): Promise<Buffer>;
    /**
     * @inheritDoc
     */
    getDataSignature(signer: SolanaSigner, data: Buffer): Promise<string>;
    /**
     * @inheritDoc
     */
    isValidDataSignature(data: Buffer, signature: string, publicKey: string): Promise<boolean>;
    /**
     * @inheritDoc
     */
    isClaimable(signer: string, data: SolanaSwapData): Promise<boolean>;
    /**
     * @inheritDoc
     */
    isCommited(swapData: SolanaSwapData): Promise<boolean>;
    /**
     * @inheritDoc
     */
    isExpired(signer: string, data: SolanaSwapData): Promise<boolean>;
    /**
     * @inheritDoc
     */
    isRequestRefundable(signer: string, data: SolanaSwapData): Promise<boolean>;
    /**
     * @inheritDoc
     */
    getHashForOnchain(outputScript: Buffer, amount: bigint, confirmations: number, nonce?: bigint): Buffer;
    /**
     * @inheritDoc
     */
    getHashForHtlc(swapHash: Buffer): Buffer;
    /**
     * @inheritDoc
     */
    getHashForTxId(txId: string, confirmations: number): Buffer;
    /**
     * @inheritDoc
     */
    getCommitStatus(signer: string, data: SolanaSwapData): Promise<SwapCommitState>;
    /**
     * @inheritDoc
     */
    getCommitStatuses(request: {
        signer: string;
        swapData: SolanaSwapData;
    }[]): Promise<{
        [p: string]: SwapCommitState;
    }>;
    /**
     * @inheritDoc
     */
    getClaimHashStatus(claimHash: string): Promise<SwapCommitStateType>;
    /**
     * @inheritDoc
     */
    getCommitedData(claimHashHex: string): Promise<SolanaSwapData | null>;
    /**
     * @inheritDoc
     */
    getHistoricalSwaps(signer: string, startBlockheight?: number): Promise<{
        swaps: {
            [escrowHash: string]: {
                init?: {
                    data: SolanaSwapData;
                    getInitTxId: () => Promise<string>;
                    getTxBlock: () => Promise<{
                        blockTime: number;
                        blockHeight: number;
                    }>;
                };
                state: SwapCommitState;
            };
        };
        latestBlockheight?: number;
    }>;
    /**
     * @inheritDoc
     */
    createSwapData(type: ChainSwapType, offerer: string, claimer: string, token: string, amount: bigint, claimHash: string, sequence: bigint, expiry: bigint, payIn: boolean, payOut: boolean, securityDeposit: bigint, claimerBounty: bigint, depositToken?: string): Promise<SolanaSwapData>;
    /**
     * @inheritDoc
     */
    getBalance(signer: string, tokenAddress: string, inContract: boolean): Promise<bigint>;
    /**
     * @inheritDoc
     */
    getIntermediaryData(address: string, token: string): Promise<{
        balance: bigint;
        reputation: IntermediaryReputationType;
    } | null>;
    /**
     * @inheritDoc
     */
    getIntermediaryReputation(address: string, token: string): Promise<IntermediaryReputationType | null>;
    getIntermediaryBalance(address: PublicKey, token: PublicKey): Promise<bigint>;
    /**
     * @inheritDoc
     */
    txsClaimWithSecret(signer: string | SolanaSigner, swapData: SolanaSwapData, secret: string, checkExpiry?: boolean, initAta?: boolean, feeRate?: string, skipAtaCheck?: boolean): Promise<SolanaTx[]>;
    /**
     * @inheritDoc
     */
    txsClaimWithTxData(signer: string | SolanaSigner, swapData: SolanaSwapData, tx: {
        blockhash: string;
        confirmations: number;
        txid: string;
        hex: string;
        height: number;
    }, requiredConfirmations: number, vout: number, commitedHeader?: SolanaBtcStoredHeader, synchronizer?: RelaySynchronizer<any, SolanaTx, any>, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * @inheritDoc
     */
    txsRefund(signer: string, swapData: SolanaSwapData, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * @inheritDoc
     */
    txsRefundWithAuthorization(signer: string, swapData: SolanaSwapData, sig: SignatureData, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * @inheritDoc
     */
    txsInit(sender: string, swapData: SolanaSwapData, sig: SignatureData, skipChecks?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * @inheritDoc
     */
    txsWithdraw(signer: string, token: string, amount: bigint, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * @inheritDoc
     */
    txsDeposit(signer: string, token: string, amount: bigint, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * @inheritDoc
     */
    claimWithSecret(signer: SolanaSigner, swapData: SolanaSwapData, secret: string, checkExpiry?: boolean, initAta?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    /**
     * @inheritDoc
     */
    claimWithTxData(signer: SolanaSigner, swapData: SolanaSwapData, tx: {
        blockhash: string;
        confirmations: number;
        txid: string;
        hex: string;
        height: number;
    }, requiredConfirmations: number, vout: number, commitedHeader?: SolanaBtcStoredHeader, synchronizer?: RelaySynchronizer<any, SolanaTx, any>, initAta?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    /**
     * @inheritDoc
     */
    refund(signer: SolanaSigner, swapData: SolanaSwapData, check?: boolean, initAta?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    /**
     * @inheritDoc
     */
    refundWithAuthorization(signer: SolanaSigner, swapData: SolanaSwapData, signature: SignatureData, check?: boolean, initAta?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    /**
     * @inheritDoc
     */
    init(signer: SolanaSigner, swapData: SolanaSwapData, signature: SignatureData, skipChecks?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string>;
    /**
     * @inheritDoc
     */
    initAndClaimWithSecret(signer: SolanaSigner, swapData: SolanaSwapData, signature: SignatureData, secret: string, skipChecks?: boolean, txOptions?: TransactionConfirmationOptions): Promise<string[]>;
    /**
     * @inheritDoc
     */
    withdraw(signer: SolanaSigner, token: string, amount: bigint, txOptions?: TransactionConfirmationOptions): Promise<string>;
    /**
     * @inheritDoc
     */
    deposit(signer: SolanaSigner, token: string, amount: bigint, txOptions?: TransactionConfirmationOptions): Promise<string>;
    /**
     * @inheritDoc
     */
    getInitPayInFeeRate(offerer?: string, claimer?: string, token?: string, claimHash?: string): Promise<string>;
    /**
     * @inheritDoc
     */
    getInitFeeRate(offerer?: string, claimer?: string, token?: string, claimHash?: string): Promise<string>;
    /**
     * @inheritDoc
     */
    getRefundFeeRate(swapData: SolanaSwapData): Promise<string>;
    /**
     * @inheritDoc
     */
    getClaimFeeRate(signer: string, swapData: SolanaSwapData): Promise<string>;
    /**
     * @inheritDoc
     */
    getClaimFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * @inheritDoc
     */
    getRawClaimFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * @inheritDoc
     */
    getCommitFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * @inheritDoc
     */
    getRawCommitFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * @inheritDoc
     */
    getRefundFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * @inheritDoc
     */
    getRawRefundFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * @inheritDoc
     */
    getExtraData(outputScript: Buffer, amount: bigint, confirmations: number, nonce?: bigint): Buffer;
}
