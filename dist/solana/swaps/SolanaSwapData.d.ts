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
 * @category Swaps
 */
export declare class SolanaSwapData extends SwapData {
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
    claimerAta?: PublicKey;
    offererAta?: PublicKey;
    securityDeposit: BN;
    claimerBounty: BN;
    txoHash?: string;
    constructor(args: SolanaSwapDataCtorArgs);
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
    toSwapDataStruct(): IdlTypes<SwapProgram>["SwapData"];
    correctPDA(account: IdlAccounts<SwapProgram>["escrowState"]): boolean;
    /**
     * @inheritDoc
     */
    equals(other: SolanaSwapData): boolean;
    /**
     * Converts initialize instruction data into {SolanaSwapData}
     *
     * @param initIx
     * @param txoHash
     * @private
     * @returns {SolanaSwapData} converted and parsed swap data
     */
    static fromInstruction(initIx: InitInstruction, txoHash: string): SolanaSwapData;
    static fromEscrowState(account: IdlAccounts<SwapProgram>["escrowState"]): SolanaSwapData;
    static typeToKind(type: ChainSwapType): number;
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
