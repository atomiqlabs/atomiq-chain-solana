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
    getOfferer(): string;
    setOfferer(newOfferer: string): void;
    getClaimer(): string;
    setClaimer(newClaimer: string): void;
    serialize(): {
        type: "sol";
    } & Serialized<SolanaSwapData>;
    getAmount(): bigint;
    getToken(): string;
    isToken(token: string): boolean;
    getType(): ChainSwapType;
    getExpiry(): bigint;
    getConfirmationsHint(): number;
    getNonceHint(): bigint;
    isPayIn(): boolean;
    isPayOut(): boolean;
    isTrackingReputation(): boolean;
    getClaimHash(): string;
    getEscrowHash(): string;
    getSequence(): bigint;
    getTxoHashHint(): string | null;
    getHTLCHashHint(): string | null;
    getExtraData(): string | null;
    setExtraData(txoHash: string): void;
    getSecurityDeposit(): bigint;
    getClaimerBounty(): bigint;
    getTotalDeposit(): bigint;
    toSwapDataStruct(): IdlTypes<SwapProgram>["SwapData"];
    correctPDA(account: IdlAccounts<SwapProgram>["escrowState"]): boolean;
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
    isClaimer(address: string): boolean;
    isOfferer(address: string): boolean;
    getDepositToken(): string;
    isDepositToken(token: string): boolean;
}
