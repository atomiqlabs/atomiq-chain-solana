import { PublicKey } from "@solana/web3.js";
import * as BN from "bn.js";
import { SwapData, ChainSwapType } from "@atomiqlabs/base";
import { SwapProgram } from "./programTypes";
import { IdlAccounts, IdlTypes } from "@coral-xyz/anchor";
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
    txoHash: string;
    constructor(offerer: PublicKey, claimer: PublicKey, token: PublicKey, amount: BN, paymentHash: string, sequence: BN, expiry: BN, nonce: BN, confirmations: number, payOut: boolean, kind: number, payIn: boolean, offererAta: PublicKey, claimerAta: PublicKey, securityDeposit: BN, claimerBounty: BN, txoHash: string);
    constructor(data: any);
    getOfferer(): string;
    setOfferer(newOfferer: string): void;
    getClaimer(): string;
    setClaimer(newClaimer: string): void;
    serialize(): any;
    getAmount(): BN;
    getToken(): string;
    isToken(token: string): boolean;
    getType(): ChainSwapType;
    getExpiry(): BN;
    getConfirmationsHint(): number;
    getNonceHint(): BN;
    isPayIn(): boolean;
    isPayOut(): boolean;
    getClaimHash(): string;
    getEscrowHash(): string;
    getSequence(): BN;
    getTxoHashHint(): string;
    getExtraData(): string;
    setExtraData(txoHash: string): void;
    getSecurityDeposit(): BN;
    getClaimerBounty(): BN;
    getTotalDeposit(): BN;
    toSwapDataStruct(): IdlTypes<SwapProgram>["SwapData"];
    correctPDA(account: IdlAccounts<SwapProgram>["escrowState"]): boolean;
    equals(other: SolanaSwapData): boolean;
    static fromEscrowState(account: IdlAccounts<SwapProgram>["escrowState"]): SolanaSwapData;
    static typeToKind(type: ChainSwapType): number;
    static kindToType(value: number): ChainSwapType;
    isClaimer(address: string): boolean;
    isOfferer(address: string): boolean;
    getDepositToken(): string;
}
