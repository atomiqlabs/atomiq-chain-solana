import {PublicKey} from "@solana/web3.js";
import * as BN from "bn.js";
import {ChainSwapType, SwapData} from "@atomiqlabs/base";
import {SwapProgram} from "./programTypes";
import {IdlAccounts, IdlTypes} from "@coral-xyz/anchor";
import {SwapTypeEnum} from "./SwapTypeEnum";
import {Buffer} from "buffer";
import {getAssociatedTokenAddressSync} from "@solana/spl-token";
import {Serialized, toBigInt, toClaimHash, toEscrowHash} from "../../utils/Utils";
import {SolanaTokens} from "../chain/modules/SolanaTokens";
import {SingleInstructionWithAccounts} from "../program/modules/SolanaProgramEvents";

export type InitInstruction = SingleInstructionWithAccounts<SwapProgram["instructions"][2 | 3], SwapProgram>;

const EXPIRY_BLOCKHEIGHT_THRESHOLD = new BN("1000000000");

export type SolanaSwapDataCtorArgs = {
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

    txoHash?: string
};

export function isSerializedData(obj: any): obj is ({type: "sol"} & Serialized<SolanaSwapData>) {
    return obj.type==="sol";
}

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

    txoHash?: string;

    constructor(args: SolanaSwapDataCtorArgs);
    constructor(data: {type: "sol"} & Serialized<SolanaSwapData>);

    constructor(data: ({type: "sol"} & Serialized<SolanaSwapData>) | SolanaSwapDataCtorArgs) {
        super();
        if(!isSerializedData(data)) {
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
        } else {
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

    serialize(): {type: "sol"} & Serialized<SolanaSwapData> {
        return {
            type: "sol",
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
        if(this.expiry.lt(EXPIRY_BLOCKHEIGHT_THRESHOLD)) throw new Error("Expiry expressed as bitcoin blockheight!");
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

    getTxoHashHint(): string | null {
        if(this.txoHash==="0000000000000000000000000000000000000000000000000000000000000000") return null; //Txo hash opt-out flag
        return this.txoHash ?? null
    }

    getHTLCHashHint(): string | null {
        if(this.getType()===ChainSwapType.HTLC) return this.paymentHash;
        return null;
    }

    getExtraData(): string | null {
        return this.txoHash ?? null;
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

    /**
     * Converts initialize instruction data into {SolanaSwapData}
     *
     * @param initIx
     * @param txoHash
     * @private
     * @returns {SolanaSwapData} converted and parsed swap data
     */
    static fromInstruction(
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

        return new SolanaSwapData({
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
            txoHash
        });
    }

    static fromEscrowState(account: IdlAccounts<SwapProgram>["escrowState"]) {
        const data: IdlTypes<SwapProgram>["SwapData"] = account.data;

        return new SolanaSwapData({
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
            claimerBounty: account.claimerBounty
        });
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
        throw new Error("Unknown swap kind type!");
    }

    isClaimer(address: string) {
        const _address = new PublicKey(address);
        if(this.isPayOut()) {
            //Also check that swapData's ATA is correct
            const ourAta = getAssociatedTokenAddressSync(this.token, _address);
            if(this.claimerAta==null || !this.claimerAta.equals(ourAta)) return false;
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
