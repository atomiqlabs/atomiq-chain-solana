"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSwapData = exports.isSerializedData = void 0;
const web3_js_1 = require("@solana/web3.js");
const BN = require("bn.js");
const base_1 = require("@atomiqlabs/base");
const SwapTypeEnum_1 = require("./SwapTypeEnum");
const buffer_1 = require("buffer");
const spl_token_1 = require("@solana/spl-token");
const Utils_1 = require("../../utils/Utils");
const SolanaTokens_1 = require("../chain/modules/SolanaTokens");
const EXPIRY_BLOCKHEIGHT_THRESHOLD = new BN("1000000000");
function isSerializedData(obj) {
    return obj.type === "sol";
}
exports.isSerializedData = isSerializedData;
/**
 * @category Swaps
 */
class SolanaSwapData extends base_1.SwapData {
    constructor(data) {
        super();
        if (!isSerializedData(data)) {
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
        }
        else {
            this.offerer = new web3_js_1.PublicKey(data.offerer);
            this.claimer = new web3_js_1.PublicKey(data.claimer);
            this.token = new web3_js_1.PublicKey(data.token);
            this.amount = new BN(data.amount);
            this.paymentHash = data.paymentHash;
            this.sequence = new BN(data.sequence);
            this.expiry = new BN(data.expiry);
            this.nonce = new BN(data.nonce);
            this.confirmations = data.confirmations;
            this.payOut = data.payOut;
            this.kind = data.kind;
            this.payIn = data.payIn;
            this.claimerAta = data.claimerAta == null ? undefined : new web3_js_1.PublicKey(data.claimerAta);
            this.offererAta = data.offererAta == null ? undefined : new web3_js_1.PublicKey(data.offererAta);
            this.securityDeposit = new BN(data.securityDeposit);
            this.claimerBounty = new BN(data.claimerBounty);
            this.txoHash = data.txoHash;
        }
    }
    getOfferer() {
        return this.offerer.toBase58();
    }
    setOfferer(newOfferer) {
        this.offerer = new web3_js_1.PublicKey(newOfferer);
        this.offererAta = (0, spl_token_1.getAssociatedTokenAddressSync)(this.token, this.offerer);
        this.payIn = true;
    }
    getClaimer() {
        return this.claimer.toBase58();
    }
    setClaimer(newClaimer) {
        this.claimer = new web3_js_1.PublicKey(newClaimer);
        this.payIn = false;
        this.payOut = true;
        this.claimerAta = (0, spl_token_1.getAssociatedTokenAddressSync)(this.token, this.claimer);
    }
    serialize() {
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
        };
    }
    getAmount() {
        return (0, Utils_1.toBigInt)(this.amount);
    }
    getToken() {
        return this.token.toString();
    }
    isToken(token) {
        return this.token.equals(new web3_js_1.PublicKey(token));
    }
    getType() {
        return SolanaSwapData.kindToType(this.kind);
    }
    getExpiry() {
        if (this.expiry.lt(EXPIRY_BLOCKHEIGHT_THRESHOLD))
            throw new Error("Expiry expressed as bitcoin blockheight!");
        return (0, Utils_1.toBigInt)(this.expiry);
    }
    getConfirmationsHint() {
        return this.confirmations;
    }
    getNonceHint() {
        return (0, Utils_1.toBigInt)(this.nonce);
    }
    isPayIn() {
        return this.payIn;
    }
    isPayOut() {
        return this.payOut;
    }
    isTrackingReputation() {
        return !this.payOut;
    }
    getClaimHash() {
        return (0, Utils_1.toClaimHash)(this.paymentHash, (0, Utils_1.toBigInt)(this.nonce), this.confirmations);
    }
    getEscrowHash() {
        return (0, Utils_1.toEscrowHash)(this.paymentHash, this.sequence);
    }
    getSequence() {
        return (0, Utils_1.toBigInt)(this.sequence);
    }
    getTxoHashHint() {
        if (this.txoHash === "0000000000000000000000000000000000000000000000000000000000000000")
            return null; //Txo hash opt-out flag
        return this.txoHash ?? null;
    }
    getHTLCHashHint() {
        if (this.getType() === base_1.ChainSwapType.HTLC)
            return this.paymentHash;
        return null;
    }
    getExtraData() {
        return this.txoHash ?? null;
    }
    setExtraData(txoHash) {
        this.txoHash = txoHash;
    }
    getSecurityDeposit() {
        return (0, Utils_1.toBigInt)(this.securityDeposit);
    }
    getClaimerBounty() {
        return (0, Utils_1.toBigInt)(this.claimerBounty);
    }
    getTotalDeposit() {
        return (0, Utils_1.toBigInt)(this.claimerBounty.lt(this.securityDeposit) ? this.securityDeposit : this.claimerBounty);
    }
    toSwapDataStruct() {
        return {
            kind: SwapTypeEnum_1.SwapTypeEnum.fromNumber(this.kind),
            confirmations: this.confirmations,
            nonce: this.nonce,
            hash: [...buffer_1.Buffer.from(this.paymentHash, "hex")],
            payIn: this.payIn,
            payOut: this.payOut,
            amount: this.amount,
            expiry: this.expiry,
            sequence: this.sequence
        };
    }
    correctPDA(account) {
        return SwapTypeEnum_1.SwapTypeEnum.toNumber(account.data.kind) === this.kind &&
            account.data.confirmations === this.confirmations &&
            this.nonce.eq(account.data.nonce) &&
            buffer_1.Buffer.from(account.data.hash).toString("hex") === this.paymentHash &&
            account.data.payIn === this.payIn &&
            account.data.payOut === this.payOut &&
            this.amount.eq(account.data.amount) &&
            this.expiry.eq(account.data.expiry) &&
            this.sequence.eq(account.data.sequence) &&
            account.offerer.equals(this.offerer) &&
            (this.offererAta == null || account.offererAta.equals(this.offererAta)) &&
            account.claimer.equals(this.claimer) &&
            (this.claimerAta == null || account.claimerAta.equals(this.claimerAta)) &&
            account.mint.equals(this.token) &&
            this.claimerBounty.eq(account.claimerBounty) &&
            this.securityDeposit.eq(account.securityDeposit);
    }
    equals(other) {
        if (this.claimerAta == null && other.claimerAta != null)
            return false;
        if (this.claimerAta != null && other.claimerAta == null)
            return false;
        if (this.claimerAta != null && other.claimerAta != null) {
            if (!this.claimerAta.equals(other.claimerAta))
                return false;
        }
        if (this.offererAta == null && other.offererAta != null)
            return false;
        if (this.offererAta != null && other.offererAta == null)
            return false;
        if (this.offererAta != null && other.offererAta != null) {
            if (!this.offererAta.equals(other.offererAta))
                return false;
        }
        return other.kind === this.kind &&
            other.confirmations === this.confirmations &&
            this.nonce.eq(other.nonce) &&
            other.paymentHash === this.paymentHash &&
            this.sequence.eq(other.sequence) &&
            other.payIn === this.payIn &&
            other.payOut === this.payOut &&
            other.offerer.equals(this.offerer) &&
            other.claimer.equals(this.claimer) &&
            other.expiry.eq(this.expiry) &&
            other.amount.eq(this.amount) &&
            other.securityDeposit.eq(this.securityDeposit) &&
            other.claimerBounty.eq(this.claimerBounty) &&
            other.token.equals(this.token);
    }
    /**
     * Converts initialize instruction data into {SolanaSwapData}
     *
     * @param initIx
     * @param txoHash
     * @private
     * @returns {SolanaSwapData} converted and parsed swap data
     */
    static fromInstruction(initIx, txoHash) {
        const paymentHash = buffer_1.Buffer.from(initIx.data.swapData.hash);
        let securityDeposit = new BN(0);
        let claimerBounty = new BN(0);
        let payIn = true;
        if (initIx.name === "offererInitialize") {
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
            kind: SwapTypeEnum_1.SwapTypeEnum.toNumber(initIx.data.swapData.kind),
            payIn,
            offererAta: initIx.name === "offererInitializePayIn" ? initIx.accounts.offererAta : web3_js_1.PublicKey.default,
            claimerAta: initIx.data.swapData.payOut ? initIx.accounts.claimerAta : web3_js_1.PublicKey.default,
            securityDeposit,
            claimerBounty,
            txoHash
        });
    }
    static fromEscrowState(account) {
        const data = account.data;
        return new SolanaSwapData({
            offerer: account.offerer,
            claimer: account.claimer,
            token: account.mint,
            amount: data.amount,
            paymentHash: buffer_1.Buffer.from(data.hash).toString("hex"),
            sequence: data.sequence,
            expiry: data.expiry,
            nonce: data.nonce,
            confirmations: data.confirmations,
            payOut: data.payOut,
            kind: SwapTypeEnum_1.SwapTypeEnum.toNumber(data.kind),
            payIn: data.payIn,
            offererAta: account.offererAta,
            claimerAta: account.claimerAta,
            securityDeposit: account.securityDeposit,
            claimerBounty: account.claimerBounty
        });
    }
    static typeToKind(type) {
        switch (type) {
            case base_1.ChainSwapType.HTLC:
                return 0;
            case base_1.ChainSwapType.CHAIN:
                return 1;
            case base_1.ChainSwapType.CHAIN_NONCED:
                return 2;
            case base_1.ChainSwapType.CHAIN_TXID:
                return 3;
        }
    }
    static kindToType(value) {
        switch (value) {
            case 0:
                return base_1.ChainSwapType.HTLC;
            case 1:
                return base_1.ChainSwapType.CHAIN;
            case 2:
                return base_1.ChainSwapType.CHAIN_NONCED;
            case 3:
                return base_1.ChainSwapType.CHAIN_TXID;
        }
        throw new Error("Unknown swap kind type!");
    }
    isClaimer(address) {
        const _address = new web3_js_1.PublicKey(address);
        if (this.isPayOut()) {
            //Also check that swapData's ATA is correct
            const ourAta = (0, spl_token_1.getAssociatedTokenAddressSync)(this.token, _address);
            if (this.claimerAta == null || !this.claimerAta.equals(ourAta))
                return false;
        }
        return this.claimer.equals(new web3_js_1.PublicKey(address));
    }
    isOfferer(address) {
        return this.offerer.equals(new web3_js_1.PublicKey(address));
    }
    getDepositToken() {
        return SolanaTokens_1.SolanaTokens.WSOL_ADDRESS.toString();
    }
    isDepositToken(token) {
        return SolanaTokens_1.SolanaTokens.WSOL_ADDRESS.equals(new web3_js_1.PublicKey(token));
    }
}
exports.SolanaSwapData = SolanaSwapData;
base_1.SwapData.deserializers["sol"] = SolanaSwapData;
