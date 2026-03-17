import { PublicKey } from "@solana/web3.js";
import * as BN from "bn.js";
import { ChainSwapType, SwapData } from "@atomiqlabs/base";
import { SwapProgram } from "./programTypes";
import { IdlAccounts, IdlTypes } from "@coral-xyz/anchor";
import { Serialized } from "../../utils/Utils";
import { SingleInstructionWithAccounts } from "../program/modules/SolanaProgramEvents";
export type InitInstruction = SingleInstructionWithAccounts<SwapProgram["instructions"][2 | 3], SwapProgram>;
export type SolanaSwapDataCtorArgs = {
    offerer: PublicKey;
    claimer: PublicKey;
    token: PublicKey;
    amount: BN;
    paymentHash: string;
    sequence: BN;
    expiry: BN;
    nonce: BN;
    confirmations: number;
    payOut: boolean;
    kind: number;
    payIn: boolean;
    offererAta?: PublicKey;
    claimerAta?: PublicKey;
    securityDeposit: BN;
    claimerBounty: BN;
    txoHash?: string;
};
export declare function isSerializedData(obj: any): obj is ({
    type: "sol";
} & Serialized<SolanaSwapData>);
/**
 * Represents Solana swap data for executing PrTLC (on-chain) or HTLC (lightning) based swaps.
 *
 * @category Swaps
 */
export declare class SolanaSwapData extends SwapData {
    /**
     * Offerer address funding the swap.
     */
    offerer: PublicKey;
    /**
     * Claimer address receiving the swap funds.
     */
    claimer: PublicKey;
    /**
     * Token mint used for the swap.
     */
    token: PublicKey;
    /**
     * Swap amount.
     */
    amount: BN;
    /**
     * Payment hash identifying the swap.
     */
    paymentHash: string;
    /**
     * Swap sequence used for uniqueness.
     */
    sequence: BN;
    /**
     * Swap expiry timestamp.
     */
    expiry: BN;
    /**
     * Nonce used in claim hash derivation.
     */
    nonce: BN;
    /**
     * Required bitcoin confirmations for claim.
     */
    confirmations: number;
    /**
     * Whether funds are paid out to claimer wallet directly.
     */
    payOut: boolean;
    /**
     * Solana on-chain swap kind discriminator.
     */
    kind: number;
    /**
     * Whether funds are paid in from offerer wallet.
     */
    payIn: boolean;
    /**
     * Optional claimer associated token account.
     */
    claimerAta?: PublicKey;
    /**
     * Optional offerer associated token account.
     */
    offererAta?: PublicKey;
    /**
     * Security deposit amount.
     */
    securityDeposit: BN;
    /**
     * Claimer bounty amount.
     */
    claimerBounty: BN;
    /**
     * Optional txo hash hint.
     */
    txoHash?: string;
    /**
     * Creates swap data from structured constructor arguments.
     *
     * @param args Swap data fields
     */
    constructor(args: SolanaSwapDataCtorArgs);
    /**
     * Deserializes swap data from serialized storage representation.
     *
     * @param data Serialized swap data from {@link SolanaSwapData.serialize}
     */
    constructor(data: {
        type: "sol";
    } & Serialized<SolanaSwapData>);
    /**
     * @inheritDoc
     */
    getOfferer(): string;
    /**
     * @inheritDoc
     */
    setOfferer(newOfferer: string): void;
    /**
     * @inheritDoc
     */
    getClaimer(): string;
    /**
     * @inheritDoc
     */
    setClaimer(newClaimer: string): void;
    /**
     * @inheritDoc
     */
    serialize(): {
        type: "sol";
    } & Serialized<SolanaSwapData>;
    /**
     * @inheritDoc
     */
    getAmount(): bigint;
    /**
     * @inheritDoc
     */
    getToken(): string;
    /**
     * @inheritDoc
     */
    isToken(token: string): boolean;
    /**
     * @inheritDoc
     */
    getType(): ChainSwapType;
    /**
     * @inheritDoc
     */
    getExpiry(): bigint;
    /**
     * @inheritDoc
     */
    getConfirmationsHint(): number;
    /**
     * @inheritDoc
     */
    getNonceHint(): bigint;
    /**
     * @inheritDoc
     */
    isPayIn(): boolean;
    /**
     * @inheritDoc
     */
    isPayOut(): boolean;
    /**
     * @inheritDoc
     */
    isTrackingReputation(): boolean;
    /**
     * @inheritDoc
     */
    getClaimHash(): string;
    /**
     * @inheritDoc
     */
    getEscrowHash(): string;
    /**
     * @inheritDoc
     */
    getSequence(): bigint;
    /**
     * @inheritDoc
     */
    getTxoHashHint(): string | null;
    /**
     * @inheritDoc
     */
    getHTLCHashHint(): string | null;
    /**
     * @inheritDoc
     */
    getExtraData(): string | null;
    /**
     * @inheritDoc
     */
    setExtraData(txoHash: string): void;
    /**
     * @inheritDoc
     */
    getSecurityDeposit(): bigint;
    /**
     * @inheritDoc
     */
    getClaimerBounty(): bigint;
    /**
     * @inheritDoc
     */
    getTotalDeposit(): bigint;
    /**
     * Serializes the swap data into the Solana program `SwapData` struct representation.
     */
    toSwapDataStruct(): IdlTypes<SwapProgram>["SwapData"];
    /**
     * Checks whether the provided escrow account matches this swap data.
     *
     * @param account Escrow account data fetched from chain
     */
    correctPDA(account: IdlAccounts<SwapProgram>["escrowState"]): boolean;
    /**
     * @inheritDoc
     */
    equals(other: SolanaSwapData): boolean;
    /**
     * Converts initialize instruction data into {@link SolanaSwapData}.
     *
     * @param initIx Decoded initialize instruction
     * @param txoHash Parsed txo hash hint from initialize event
     * @returns Converted and parsed swap data
     */
    static fromInstruction(initIx: InitInstruction, txoHash: string): SolanaSwapData;
    /**
     * Deserializes swap data from an on-chain escrow account state.
     *
     * @param account Escrow account state as returned by Anchor
     */
    static fromEscrowState(account: IdlAccounts<SwapProgram>["escrowState"]): SolanaSwapData;
    /**
     * Converts abstract swap type to Solana program kind discriminator.
     *
     * @param type Chain-agnostic swap type
     */
    static typeToKind(type: ChainSwapType): number;
    /**
     * Converts Solana program kind discriminator to abstract swap type.
     *
     * @param value Solana program swap kind value
     */
    static kindToType(value: number): ChainSwapType;
    /**
     * @inheritDoc
     */
    isClaimer(address: string): boolean;
    /**
     * @inheritDoc
     */
    isOfferer(address: string): boolean;
    /**
     * @inheritDoc
     */
    getDepositToken(): string;
    /**
     * @inheritDoc
     */
    isDepositToken(token: string): boolean;
}
