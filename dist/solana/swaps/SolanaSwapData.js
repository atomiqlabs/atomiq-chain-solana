"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSwapData = void 0;
const web3_js_1 = require("@solana/web3.js");
const BN = require("bn.js");
const base_1 = require("@atomiqlabs/base");
const SwapTypeEnum_1 = require("./SwapTypeEnum");
const buffer_1 = require("buffer");
const spl_token_1 = require("@solana/spl-token");
const Utils_1 = require("../../utils/Utils");
const EXPIRY_BLOCKHEIGHT_THRESHOLD = new BN("1000000000");
class SolanaSwapData extends base_1.SwapData {
    constructor(offererOrData, claimer, token, amount, paymentHash, sequence, expiry, nonce, confirmations, payOut, kind, payIn, offererAta, claimerAta, securityDeposit, claimerBounty, txoHash) {
        super();
        if (claimer != null || token != null || amount != null || paymentHash != null || expiry != null ||
            nonce != null || confirmations != null || payOut != null || kind != null || payIn != null || claimerAta != null) {
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
        }
        else {
            this.offerer = offererOrData.offerer == null ? null : new web3_js_1.PublicKey(offererOrData.offerer);
            this.claimer = offererOrData.claimer == null ? null : new web3_js_1.PublicKey(offererOrData.claimer);
            this.token = offererOrData.token == null ? null : new web3_js_1.PublicKey(offererOrData.token);
            this.amount = offererOrData.amount == null ? null : new BN(offererOrData.amount);
            this.paymentHash = offererOrData.paymentHash;
            this.sequence = offererOrData.sequence == null ? null : new BN(offererOrData.sequence);
            this.expiry = offererOrData.expiry == null ? null : new BN(offererOrData.expiry);
            this.nonce = offererOrData.nonce == null ? null : new BN(offererOrData.nonce);
            this.confirmations = offererOrData.confirmations;
            this.payOut = offererOrData.payOut;
            this.kind = offererOrData.kind;
            this.payIn = offererOrData.payIn;
            this.claimerAta = offererOrData.claimerAta == null ? null : new web3_js_1.PublicKey(offererOrData.claimerAta);
            this.offererAta = offererOrData.offererAta == null ? null : new web3_js_1.PublicKey(offererOrData.offererAta);
            this.securityDeposit = offererOrData.securityDeposit == null ? null : new BN(offererOrData.securityDeposit);
            this.claimerBounty = offererOrData.claimerBounty == null ? null : new BN(offererOrData.claimerBounty);
            this.txoHash = offererOrData.txoHash;
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
            offerer: this.offerer == null ? null : this.offerer.toBase58(),
            claimer: this.claimer == null ? null : this.claimer.toBase58(),
            token: this.token == null ? null : this.token.toBase58(),
            amount: this.amount == null ? null : this.amount.toString(10),
            paymentHash: this.paymentHash,
            sequence: this.sequence == null ? null : this.sequence.toString(10),
            expiry: this.expiry == null ? null : this.expiry.toString(10),
            nonce: this.nonce == null ? null : this.nonce.toString(10),
            confirmations: this.confirmations,
            payOut: this.payOut,
            kind: this.kind,
            payIn: this.payIn,
            offererAta: this.offererAta == null ? null : this.offererAta.toBase58(),
            claimerAta: this.claimerAta == null ? null : this.claimerAta.toBase58(),
            securityDeposit: this.securityDeposit == null ? null : this.securityDeposit.toString(10),
            claimerBounty: this.claimerBounty == null ? null : this.claimerBounty.toString(10),
            txoHash: this.txoHash
        };
    }
    getAmount() {
        return this.amount;
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
            return null;
        return this.expiry;
    }
    getConfirmationsHint() {
        return this.confirmations;
    }
    getNonceHint() {
        return this.nonce;
    }
    isPayIn() {
        return this.payIn;
    }
    isPayOut() {
        return this.payOut;
    }
    getClaimHash() {
        return (0, Utils_1.toClaimHash)(this.paymentHash, this.nonce, this.confirmations);
    }
    getEscrowHash() {
        return (0, Utils_1.toEscrowHash)(this.paymentHash, this.sequence);
    }
    getSequence() {
        return this.sequence;
    }
    getTxoHashHint() {
        return this.txoHash;
    }
    getExtraData() {
        return this.txoHash;
    }
    setExtraData(txoHash) {
        this.txoHash = txoHash;
    }
    getSecurityDeposit() {
        return this.securityDeposit;
    }
    getClaimerBounty() {
        return this.claimerBounty;
    }
    getTotalDeposit() {
        return this.claimerBounty.lt(this.securityDeposit) ? this.securityDeposit : this.claimerBounty;
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
    static fromEscrowState(account) {
        const data = account.data;
        return new SolanaSwapData(account.offerer, account.claimer, account.mint, data.amount, buffer_1.Buffer.from(data.hash).toString("hex"), data.sequence, data.expiry, data.nonce, data.confirmations, data.payOut, SwapTypeEnum_1.SwapTypeEnum.toNumber(data.kind), data.payIn, account.offererAta, account.claimerAta, account.securityDeposit, account.claimerBounty, null);
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
        return null;
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
        return null;
    }
    isClaimer(address) {
        const _address = new web3_js_1.PublicKey(address);
        if (this.isPayOut()) {
            //Also check that swapData's ATA is correct
            const ourAta = (0, spl_token_1.getAssociatedTokenAddressSync)(this.token, _address);
            if (!this.claimerAta.equals(ourAta))
                return false;
        }
        return this.claimer.equals(new web3_js_1.PublicKey(address));
    }
    isOfferer(address) {
        return this.offerer.equals(new web3_js_1.PublicKey(address));
    }
}
exports.SolanaSwapData = SolanaSwapData;
base_1.SwapData.deserializers["sol"] = SolanaSwapData;
