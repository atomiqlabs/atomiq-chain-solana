import {PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY} from "@solana/web3.js";
import * as BN from "bn.js";
import {ChainSwapType, SwapData} from "@atomiqlabs/base";
import {SwapProgram} from "./v1/programTypes";
import {IdlAccounts, IdlTypes} from "@coral-xyz/anchor";
import {SwapTypeEnum} from "./SwapTypeEnum";
import {Buffer} from "buffer";
import {getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {Serialized, toBigInt, toClaimHash, toEscrowHash} from "../../utils/Utils";
import {SolanaTokens} from "../chain/modules/SolanaTokens";
import {SingleInstructionWithAccounts} from "../program/modules/SolanaProgramEvents";
import {SolanaSwapProgram} from "./SolanaSwapProgram";
import {SwapProgramV2} from "./v2/programTypes";

export type InitInstruction = SingleInstructionWithAccounts<SwapProgram["instructions"][2 | 3] | SwapProgramV2["instructions"][2 | 3], SwapProgram>;

const EXPIRY_BLOCKHEIGHT_THRESHOLD = new BN("1000000000");

export type SolanaSwapDataCtorArgs = {
    programId: PublicKey,
    version: "v1" | "v2",

    offerer: PublicKey,
    claimer: PublicKey,
    token: PublicKey,
    amount: BN,
    paymentHash: string,
    sequence: BN,
    expiry: BN,

    nonce: BN,
    confirmations: number,
    payOut: boolean,
    kind: number,
    payIn: boolean,
    offererAta?: PublicKey,
    claimerAta?: PublicKey,

    securityDeposit: BN,
    claimerBounty: BN,

    txoHash?: string,
    offererInitializer?: boolean
};

export function isSerializedData(obj: any): obj is ({type: "sol"} & Serialized<SolanaSwapData>) {
    return obj.type==="sol";
}

/**
 * Represents Solana swap data for executing PrTLC (on-chain) or HTLC (lightning) based swaps.
 *
 * @category Swaps
 */
export class SolanaSwapData extends SwapData {

    /**
     * Program ID for which this swap data was created
     */
    programId: PublicKey;
    /**
     * Program version for which this swap was created
     */
    version: "v1" | "v2";
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
     * Optional flag whether the offerer is the initializer for V2 swap data
     */
    offererInitializer?: boolean;

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
    constructor(data: {type: "sol"} & Serialized<SolanaSwapData>);

    constructor(data: ({type: "sol"} & Serialized<SolanaSwapData>) | SolanaSwapDataCtorArgs) {
        super();
        if(!isSerializedData(data)) {
            this.programId = data.programId;
            this.version = data.version;
            this.offerer = data.offerer;
            this.claimer = data.claimer;
            this.token = data.token;
            this.amount = data.amount;
            this.paymentHash = data.paymentHash;
            this.sequence = data.sequence;
            this.expiry = data.expiry;
            this.nonce = data.nonce;
            this.confirmations = data.confirmations;
            this.payOut = data.payOut;
            this.kind = data.kind;
            this.payIn = data.payIn;
            this.claimerAta = data.claimerAta;
            this.offererAta = data.offererAta;
            this.securityDeposit = data.securityDeposit;
            this.claimerBounty = data.claimerBounty;
            this.txoHash = data.txoHash;
            this.offererInitializer = data.offererInitializer;
        } else {
            this.programId = new PublicKey(data.programId ?? "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM");
            this.version = data.version ?? "v1";
            this.offerer = new PublicKey(data.offerer);
            this.claimer = new PublicKey(data.claimer);
            this.token = new PublicKey(data.token);
            this.amount = new BN(data.amount);
            this.paymentHash = data.paymentHash;
            this.sequence = new BN(data.sequence);
            this.expiry = new BN(data.expiry);
            this.nonce = new BN(data.nonce);
            this.confirmations = data.confirmations;
            this.payOut = data.payOut;
            this.kind = data.kind;
            this.payIn = data.payIn;
            this.claimerAta = data.claimerAta==null ? undefined : new PublicKey(data.claimerAta);
            this.offererAta = data.offererAta==null ? undefined : new PublicKey(data.offererAta);
            this.securityDeposit = new BN(data.securityDeposit);
            this.claimerBounty = new BN(data.claimerBounty);
            this.txoHash = data.txoHash;
            this.offererInitializer = data.offererInitializer;
        }
    }

    /**
     * @inheritDoc
     */
    getOfferer(): string {
        return this.offerer.toBase58();
    }

    /**
     * @inheritDoc
     */
    setOfferer(newOfferer: string) {
        this.offerer = new PublicKey(newOfferer);
        this.offererAta = getAssociatedTokenAddressSync(this.token, this.offerer);
        this.payIn = true;
    }

    /**
     * @inheritDoc
     */
    getClaimer(): string {
        return this.claimer.toBase58();
    }

    /**
     * @inheritDoc
     */
    setClaimer(newClaimer: string) {
        this.claimer = new PublicKey(newClaimer);
        this.payIn = false;
        this.payOut = true;
        this.claimerAta = getAssociatedTokenAddressSync(this.token, this.claimer);
    }

    /**
     * @inheritDoc
     */
    serialize(): {type: "sol"} & Serialized<SolanaSwapData> {
        return {
            type: "sol",
            programId: this.programId?.toBase58(),
            version: this.version,
            offerer: this.offerer?.toBase58(),
            claimer: this.claimer?.toBase58(),
            token: this.token?.toBase58(),
            amount: this.amount?.toString(10),
            paymentHash: this.paymentHash,
            sequence: this.sequence?.toString(10),
            expiry: this.expiry?.toString(10),
            nonce: this.nonce?.toString(10),
            confirmations: this.confirmations,
            payOut: this.payOut,
            kind: this.kind,
            payIn: this.payIn,
            offererAta: this.offererAta?.toBase58(),
            claimerAta: this.claimerAta?.toBase58(),
            securityDeposit: this.securityDeposit?.toString(10),
            claimerBounty: this.claimerBounty?.toString(10),
            txoHash: this.txoHash,
            offererInitializer: this.offererInitializer
        }
    }

    /**
     * @inheritDoc
     */
    getAmount(): bigint {
        return toBigInt(this.amount);
    }

    /**
     * @inheritDoc
     */
    getToken(): string {
        return this.token.toString();
    }

    /**
     * @inheritDoc
     */
    isToken(token: string): boolean {
        return this.token.equals(new PublicKey(token));
    }

    /**
     * @inheritDoc
     */
    getType(): ChainSwapType {
        return SolanaSwapData.kindToType(this.kind);
    }

    /**
     * @inheritDoc
     */
    getExpiry(): bigint {
        if(this.expiry.lt(EXPIRY_BLOCKHEIGHT_THRESHOLD)) throw new Error("Expiry expressed as bitcoin blockheight!");
        return toBigInt(this.expiry);
    }

    /**
     * @inheritDoc
     */
    getConfirmationsHint(): number {
        return this.confirmations;
    }

    /**
     * @inheritDoc
     */
    getNonceHint(): bigint {
        return toBigInt(this.nonce);
    }

    /**
     * @inheritDoc
     */
    isPayIn(): boolean {
        return this.payIn;
    }

    /**
     * @inheritDoc
     */
    isPayOut(): boolean {
        return this.payOut;
    }

    /**
     * @inheritDoc
     */
    isTrackingReputation(): boolean {
        return !this.payOut;
    }

    /**
     * @inheritDoc
     */
    getClaimHash(): string {
        return toClaimHash(this.paymentHash, toBigInt(this.nonce), this.confirmations);
    }

    /**
     * @inheritDoc
     */
    getEscrowHash(): string {
        return toEscrowHash(this.paymentHash, this.sequence);
    }

    /**
     * @inheritDoc
     */
    getSequence(): bigint {
        return toBigInt(this.sequence);
    }

    /**
     * @inheritDoc
     */
    getTxoHashHint(): string | null {
        if(this.txoHash==="0000000000000000000000000000000000000000000000000000000000000000") return null; //Txo hash opt-out flag
        return this.txoHash ?? null
    }

    /**
     * @inheritDoc
     */
    getHTLCHashHint(): string | null {
        if(this.getType()===ChainSwapType.HTLC) return this.paymentHash;
        return null;
    }

    /**
     * @inheritDoc
     */
    getExtraData(): string | null {
        return this.txoHash ?? null;
    }

    /**
     * @inheritDoc
     */
    setExtraData(txoHash: string): void {
        this.txoHash = txoHash;
    }

    /**
     * @inheritDoc
     */
    getSecurityDeposit(): bigint {
        return toBigInt(this.securityDeposit);
    }

    /**
     * @inheritDoc
     */
    getClaimerBounty(): bigint {
        return toBigInt(this.claimerBounty);
    }

    /**
     * @inheritDoc
     */
    getTotalDeposit(): bigint {
        return toBigInt(this.claimerBounty.lt(this.securityDeposit) ? this.securityDeposit : this.claimerBounty);
    }

    /**
     * Serializes the swap data into the Solana program `SwapData` struct representation.
     */
    toSwapDataStruct(): IdlTypes<SwapProgram>["SwapData"] {
        return {
            kind: SwapTypeEnum.fromNumber(this.kind as 0 | 1 | 2 | 3),
            confirmations: this.confirmations,
            nonce: this.nonce,
            hash: [...Buffer.from(this.paymentHash, "hex")],
            payIn: this.payIn,
            payOut: this.payOut,
            amount: this.amount,
            expiry: this.expiry,
            sequence: this.sequence
        }
    }

    /**
     * Checks whether the provided escrow account matches this swap data.
     *
     * @param account Escrow account data fetched from chain
     */
    correctPDA(account: IdlAccounts<SwapProgram | SwapProgramV2>["escrowState"]): boolean {
        return SwapTypeEnum.toNumber(account.data.kind)===this.kind &&
            account.data.confirmations===this.confirmations &&
            this.nonce.eq(account.data.nonce) &&
            Buffer.from(account.data.hash).toString("hex")===this.paymentHash &&
            account.data.payIn===this.payIn &&
            account.data.payOut===this.payOut &&
            this.amount.eq(account.data.amount) &&
            this.expiry.eq(account.data.expiry) &&
            this.sequence.eq(account.data.sequence) &&

            account.offerer.equals(this.offerer) &&
            (this.offererAta==null || account.offererAta.equals(this.offererAta)) &&
            account.claimer.equals(this.claimer) &&
            (this.claimerAta==null || account.claimerAta.equals(this.claimerAta)) &&
            account.mint.equals(this.token) &&
            this.claimerBounty.eq(account.claimerBounty) &&
            this.securityDeposit.eq(account.securityDeposit) &&
            (this.offererInitializer==null || account.offererInitializer===this.offererInitializer);
    }

    /**
     * @inheritDoc
     */
    equals(other: SolanaSwapData): boolean {
        if(this.claimerAta==null && other.claimerAta!=null) return false;
        if(this.claimerAta!=null && other.claimerAta==null) return false;
        if(this.claimerAta!=null && other.claimerAta!=null) {
            if(!this.claimerAta.equals(other.claimerAta)) return false;
        }

        if(this.offererAta==null && other.offererAta!=null) return false;
        if(this.offererAta!=null && other.offererAta==null) return false;
        if(this.offererAta!=null && other.offererAta!=null) {
            if(!this.offererAta.equals(other.offererAta)) return false;
        }

        if(this.offererInitializer==null && other.offererInitializer!=null) return false;
        if(this.offererInitializer!=null && other.offererInitializer==null) return false;
        if(this.offererInitializer!=null && other.offererInitializer!=null) {
            if(this.offererInitializer!==other.offererInitializer) return false;
        }

        return other.kind===this.kind &&
            other.confirmations===this.confirmations &&
            this.nonce.eq(other.nonce) &&
            other.paymentHash===this.paymentHash &&
            this.sequence.eq(other.sequence) &&
            other.payIn===this.payIn &&
            other.payOut===this.payOut &&
            other.offerer.equals(this.offerer) &&
            other.claimer.equals(this.claimer) &&
            other.expiry.eq(this.expiry) &&
            other.amount.eq(this.amount) &&
            other.securityDeposit.eq(this.securityDeposit) &&
            other.claimerBounty.eq(this.claimerBounty) &&
            other.token.equals(this.token)
    }

    /**
     * Converts initialize instruction data into {@link SolanaSwapData}.
     *
     * @param programId
     * @param version
     * @param initIx Decoded initialize instruction
     * @param txoHash Parsed txo hash hint from initialize event
     * @returns Converted and parsed swap data
     */
    static fromInstruction(
        programId: PublicKey,
        version: "v1" | "v2",
        initIx: InitInstruction,
        txoHash: string
    ): SolanaSwapData {
        const paymentHash: Buffer = Buffer.from(initIx.data.swapData.hash);
        let securityDeposit: BN = new BN(0);
        let claimerBounty: BN = new BN(0);
        let payIn: boolean = true;
        if(initIx.name === "offererInitialize") {
            payIn = false;
            securityDeposit = initIx.data.securityDeposit;
            claimerBounty = initIx.data.claimerBounty;
        }
        if(version!=="v1" && initIx.name === "offererInitializePayIn") {
            payIn = true;
            securityDeposit = initIx.data.securityDeposit;
            claimerBounty = initIx.data.claimerBounty;
        }

        return new SolanaSwapData({
            programId,
            version,
            offerer: initIx.accounts.offerer,
            claimer: initIx.accounts.claimer,
            token: initIx.accounts.mint,
            amount: initIx.data.swapData.amount,
            paymentHash: paymentHash.toString("hex"),
            sequence: initIx.data.swapData.sequence,
            expiry: initIx.data.swapData.expiry,
            nonce: initIx.data.swapData.nonce,
            confirmations: initIx.data.swapData.confirmations,
            payOut: initIx.data.swapData.payOut,
            kind: SwapTypeEnum.toNumber(initIx.data.swapData.kind),
            payIn,
            offererAta: initIx.name === "offererInitializePayIn" ? initIx.accounts.offererAta : PublicKey.default,
            claimerAta: initIx.data.swapData.payOut ? initIx.accounts.claimerAta : PublicKey.default,
            securityDeposit,
            claimerBounty,
            txoHash,
            offererInitializer: initIx.accounts.initializer!=null ? initIx.accounts.initializer.equals(initIx.accounts.offerer) : undefined
        });
    }

    /**
     * Deserializes swap data from an on-chain escrow account state.
     *
     * @param programId
     * @param version
     * @param account Escrow account state as returned by Anchor
     */
    static fromEscrowState(
        programId: PublicKey,
        version: "v1" | "v2",
        account: IdlAccounts<SwapProgram | SwapProgramV2>["escrowState"]
    ) {
        const data: IdlTypes<SwapProgram | SwapProgramV2>["SwapData"] = account.data;

        return new SolanaSwapData({
            programId,
            version,
            offerer: account.offerer,
            claimer: account.claimer,
            token: account.mint,
            amount: data.amount,
            paymentHash: Buffer.from(data.hash).toString("hex"),
            sequence: data.sequence,
            expiry: data.expiry,
            nonce: data.nonce,
            confirmations: data.confirmations,
            payOut: data.payOut,
            kind: SwapTypeEnum.toNumber(data.kind),
            payIn: data.payIn,
            offererAta: account.offererAta,
            claimerAta: account.claimerAta,
            securityDeposit: account.securityDeposit,
            claimerBounty: account.claimerBounty,
            offererInitializer: account.offererInitializer ?? undefined
        });
    }

    /**
     * Converts abstract swap type to Solana program kind discriminator.
     *
     * @param type Chain-agnostic swap type
     */
    static typeToKind(type: ChainSwapType): number {
        switch (type) {
            case ChainSwapType.HTLC:
                return 0;
            case ChainSwapType.CHAIN:
                return 1;
            case ChainSwapType.CHAIN_NONCED:
                return 2;
            case ChainSwapType.CHAIN_TXID:
                return 3;
        }
    }

    /**
     * Converts Solana program kind discriminator to abstract swap type.
     *
     * @param value Solana program swap kind value
     */
    static kindToType(value: number): ChainSwapType {
        switch(value) {
            case 0:
                return ChainSwapType.HTLC;
            case 1:
                return ChainSwapType.CHAIN;
            case 2:
                return ChainSwapType.CHAIN_NONCED;
            case 3:
                return ChainSwapType.CHAIN_TXID;
        }
        throw new Error("Unknown swap kind type!");
    }

    /**
     * @inheritDoc
     */
    isClaimer(address: string) {
        const _address = new PublicKey(address);
        if(this.isPayOut()) {
            //Also check that swapData's ATA is correct
            const ourAta = getAssociatedTokenAddressSync(this.token, _address);
            if(this.claimerAta==null || !this.claimerAta.equals(ourAta)) return false;
        }
        return this.claimer.equals(new PublicKey(address));
    }

    /**
     * @inheritDoc
     */
    isOfferer(address: string) {
        return this.offerer.equals(new PublicKey(address));
    }

    /**
     * @inheritDoc
     */
    getDepositToken(): string {
        return SolanaTokens.WSOL_ADDRESS.toString();
    }

    /**
     * @inheritDoc
     */
    isDepositToken(token: string): boolean {
        return SolanaTokens.WSOL_ADDRESS.equals(new PublicKey(token));
    }

    /**
     * @inheritDoc
     */
    getEscrowStruct(): any {
        return {
            accounts: {
                offerer: this.offerer.toString(),
                claimer: this.claimer.toString(),
                claimerAta: this.claimerAta==null || this.claimerAta.equals(PublicKey.default) ? null : this.claimerAta.toString(),
                offererAta: this.offererAta==null || this.offererAta.equals(PublicKey.default) ? null : this.offererAta.toString(),
                claimerUserData: SolanaSwapProgram._SwapUserVault(this.programId, this.claimer, this.token).toString(),
                offererUserData: SolanaSwapProgram._SwapUserVault(this.programId, this.offerer, this.token).toString(),

                initializer: this.offererInitializer!=null
                    ? (
                        this.offererInitializer ? this.offerer.toString() : this.claimer.toString()
                    )
                    : (
                        this.isPayIn() ? this.offerer.toString() : this.claimer.toString()
                    ),

                escrowState: SolanaSwapProgram._SwapEscrowState(this.programId, Buffer.from(this.paymentHash, "hex")).toString(),
                mint: this.token.toString(),
                vault: SolanaSwapProgram._SwapVault(this.programId, this.token).toString(),
                vaultAuthority: SolanaSwapProgram._SwapVaultAuthority(this.programId).toString(),

                systemProgram: SystemProgram.programId.toString(),
                tokenProgram: TOKEN_PROGRAM_ID.toString(),
                ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY.toString(),
            },
            data: {
                kind: SwapTypeEnum.fromNumber(this.kind as 0 | 1 | 2 | 3),
                confirmations: this.confirmations,
                nonce: this.nonce.toString(10),
                hash: [...Buffer.from(this.paymentHash, "hex")],
                payIn: this.payIn,
                payOut: this.payOut,
                amount: this.amount.toString(10),
                expiry: this.expiry.toString(10),
                sequence: this.sequence.toString(10)
            }
        }
    }

}

export class SolanaSwapDataV1 extends SolanaSwapData {
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
    constructor(data: {type: "sol"} & Serialized<SolanaSwapData>);

    constructor(data: ({type: "sol"} & Serialized<SolanaSwapData>) | SolanaSwapDataCtorArgs) {
        super(data as any);
        if(this.version!=="v1") throw new Error(`Invalid swap data version, expected v1, got ${this.version}`);
    }
}

export class SolanaSwapDataV2 extends SolanaSwapData {
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
    constructor(data: {type: "sol"} & Serialized<SolanaSwapData>);

    constructor(data: ({type: "sol"} & Serialized<SolanaSwapData>) | SolanaSwapDataCtorArgs) {
        super(data as any);
        if(this.version!=="v2") throw new Error(`Invalid swap data version, expected v2, got ${this.version}`);
    }
}

SwapData.deserializers["sol"] = SolanaSwapData;
