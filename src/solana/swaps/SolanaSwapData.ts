import {PublicKey} from "@solana/web3.js";
import * as BN from "bn.js";
import {SwapData, ChainSwapType} from "@atomiqlabs/base";
import {SwapProgram} from "./programTypes";
import {IdlAccounts, IdlTypes} from "@coral-xyz/anchor";
import {SwapTypeEnum} from "./SwapTypeEnum";
import {Buffer} from "buffer";
import {getAssociatedTokenAddressSync} from "@solana/spl-token";
import {toBigInt, toClaimHash, toEscrowHash} from "../../utils/Utils";
import {SolanaTokens} from "../chain/modules/SolanaTokens";

const EXPIRY_BLOCKHEIGHT_THRESHOLD = new BN("1000000000");

export class SolanaSwapData extends SwapData {

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

    constructor(
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
        offererAta: PublicKey,
        claimerAta: PublicKey,

        securityDeposit: BN,
        claimerBounty: BN,

        txoHash: string
    );

    constructor(data: any);

    constructor(
        offererOrData: PublicKey | any,
        claimer?: PublicKey,
        token?: PublicKey,
        amount?: BN,
        paymentHash?: string,
        sequence?: BN,
        expiry?: BN,
        nonce?: BN,
        confirmations?: number,
        payOut?: boolean,
        kind?: number,
        payIn?: boolean,
        offererAta?: PublicKey,
        claimerAta?: PublicKey,
        securityDeposit?: BN,
        claimerBounty?: BN,
        txoHash?: string,
    ) {
        super();
        if(claimer!=null || token!=null || amount!=null || paymentHash!=null || expiry!=null ||
            nonce!=null || confirmations!=null || payOut!=null || kind!=null || payIn!=null || claimerAta!=null) {

            this.offerer = offererOrData;
            this.claimer = claimer;
            this.token = token;
            this.amount = amount;
            this.paymentHash = paymentHash;
            this.sequence = sequence;
            this.expiry = expiry;
            this.nonce = nonce;
            this.confirmations = confirmations;
            this.payOut = payOut;
            this.kind = kind;
            this.payIn = payIn;
            this.claimerAta = claimerAta;
            this.offererAta = offererAta;
            this.securityDeposit = securityDeposit;
            this.claimerBounty = claimerBounty;
            this.txoHash = txoHash;
        } else {
            this.offerer = offererOrData.offerer==null ? null : new PublicKey(offererOrData.offerer);
            this.claimer = offererOrData.claimer==null ? null : new PublicKey(offererOrData.claimer);
            this.token = offererOrData.token==null ? null : new PublicKey(offererOrData.token);
            this.amount = offererOrData.amount==null ? null : new BN(offererOrData.amount);
            this.paymentHash = offererOrData.paymentHash;
            this.sequence = offererOrData.sequence==null ? null : new BN(offererOrData.sequence);
            this.expiry = offererOrData.expiry==null ? null : new BN(offererOrData.expiry);
            this.nonce = offererOrData.nonce==null ? null : new BN(offererOrData.nonce);
            this.confirmations = offererOrData.confirmations;
            this.payOut = offererOrData.payOut;
            this.kind = offererOrData.kind;
            this.payIn = offererOrData.payIn;
            this.claimerAta = offererOrData.claimerAta==null ? null : new PublicKey(offererOrData.claimerAta);
            this.offererAta = offererOrData.offererAta==null ? null : new PublicKey(offererOrData.offererAta);
            this.securityDeposit = offererOrData.securityDeposit==null ? null : new BN(offererOrData.securityDeposit);
            this.claimerBounty = offererOrData.claimerBounty==null ? null : new BN(offererOrData.claimerBounty);
            this.txoHash = offererOrData.txoHash;
        }
    }

    getOfferer(): string {
        return this.offerer.toBase58();
    }

    setOfferer(newOfferer: string) {
        this.offerer = new PublicKey(newOfferer);
        this.offererAta = getAssociatedTokenAddressSync(this.token, this.offerer);
        this.payIn = true;
    }

    getClaimer(): string {
        return this.claimer.toBase58();
    }

    setClaimer(newClaimer: string) {
        this.claimer = new PublicKey(newClaimer);
        this.payIn = false;
        this.payOut = true;
        this.claimerAta = getAssociatedTokenAddressSync(this.token, this.claimer);
    }

    serialize(): any {
        return {
            type: "sol",
            offerer: this.offerer==null ? null : this.offerer.toBase58(),
            claimer: this.claimer==null ? null : this.claimer.toBase58(),
            token: this.token==null ? null : this.token.toBase58(),
            amount: this.amount==null ? null : this.amount.toString(10),
            paymentHash: this.paymentHash,
            sequence: this.sequence==null ? null : this.sequence.toString(10),
            expiry: this.expiry==null ? null : this.expiry.toString(10),
            nonce: this.nonce==null ? null : this.nonce.toString(10),
            confirmations: this.confirmations,
            payOut: this.payOut,
            kind: this.kind,
            payIn: this.payIn,
            offererAta: this.offererAta==null ? null : this.offererAta.toBase58(),
            claimerAta: this.claimerAta==null ? null : this.claimerAta.toBase58(),
            securityDeposit: this.securityDeposit==null ? null : this.securityDeposit.toString(10),
            claimerBounty: this.claimerBounty==null ? null : this.claimerBounty.toString(10),
            txoHash: this.txoHash
        }
    }

    getAmount(): bigint {
        return toBigInt(this.amount);
    }

    getToken(): string {
        return this.token.toString();
    }

    isToken(token: string): boolean {
        return this.token.equals(new PublicKey(token));
    }

    getType(): ChainSwapType {
        return SolanaSwapData.kindToType(this.kind);
    }

    getExpiry(): bigint {
        if(this.expiry.lt(EXPIRY_BLOCKHEIGHT_THRESHOLD)) return null;
        return toBigInt(this.expiry);
    }

    getConfirmationsHint(): number {
        return this.confirmations;
    }

    getNonceHint(): bigint {
        return toBigInt(this.nonce);
    }

    isPayIn(): boolean {
        return this.payIn;
    }

    isPayOut(): boolean {
        return this.payOut;
    }

    getClaimHash(): string {
        return toClaimHash(this.paymentHash, toBigInt(this.nonce), this.confirmations);
    }

    getEscrowHash(): string {
        return toEscrowHash(this.paymentHash, this.sequence);
    }

    getSequence(): bigint {
        return toBigInt(this.sequence);
    }

    getTxoHashHint(): string {
        if(this.txoHash==="0000000000000000000000000000000000000000000000000000000000000000") return null; //Txo hash opt-out flag
        return this.txoHash;
    }

    getExtraData(): string {
        return this.txoHash;
    }

    setExtraData(txoHash: string): void {
        this.txoHash = txoHash;
    }

    getSecurityDeposit(): bigint {
        return toBigInt(this.securityDeposit);
    }

    getClaimerBounty(): bigint {
        return toBigInt(this.claimerBounty);
    }

    getTotalDeposit(): bigint {
        return toBigInt(this.claimerBounty.lt(this.securityDeposit) ? this.securityDeposit : this.claimerBounty);
    }

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

    correctPDA(account: IdlAccounts<SwapProgram>["escrowState"]): boolean {
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
            this.securityDeposit.eq(account.securityDeposit);
    }

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

    static fromEscrowState(account: IdlAccounts<SwapProgram>["escrowState"]) {
        const data: IdlTypes<SwapProgram>["SwapData"] = account.data;

        return new SolanaSwapData(
            account.offerer,
            account.claimer,
            account.mint,
            data.amount,
            Buffer.from(data.hash).toString("hex"),
            data.sequence,
            data.expiry,
            data.nonce,
            data.confirmations,
            data.payOut,
            SwapTypeEnum.toNumber(data.kind),
            data.payIn,
            account.offererAta,
            account.claimerAta,
            account.securityDeposit,
            account.claimerBounty,
            null
        );
    }

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
        return null;
    }

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
        return null;
    }

    isClaimer(address: string) {
        const _address = new PublicKey(address);
        if(this.isPayOut()) {
            //Also check that swapData's ATA is correct
            const ourAta = getAssociatedTokenAddressSync(this.token, _address);
            if(!this.claimerAta.equals(ourAta)) return false;
        }
        return this.claimer.equals(new PublicKey(address));
    }

    isOfferer(address: string) {
        return this.offerer.equals(new PublicKey(address));
    }

    getDepositToken(): string {
        return SolanaTokens.WSOL_ADDRESS.toString();
    }

    isDepositToken(token: string): boolean {
        return SolanaTokens.WSOL_ADDRESS.equals(new PublicKey(token));
    }

}

SwapData.deserializers["sol"] = SolanaSwapData;
