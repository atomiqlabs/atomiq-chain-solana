"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapRefund = void 0;
const SolanaSwapModule_1 = require("../SolanaSwapModule");
const createHash = require("create-hash");
const tweetnacl_1 = require("tweetnacl");
const base_1 = require("@atomiqlabs/base");
const BN = require("bn.js");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const SolanaAction_1 = require("../../base/SolanaAction");
const Utils_1 = require("../../../utils/Utils");
const buffer_1 = require("buffer");
const SolanaTokens_1 = require("../../base/modules/SolanaTokens");
class SwapRefund extends SolanaSwapModule_1.SolanaSwapModule {
    /**
     * Action for generic Refund instruction
     *
     * @param swapData
     * @param refundAuthTimeout optional refund authorization timeout (should be 0 for refunding expired swaps)
     * @constructor
     * @private
     */
    Refund(swapData, refundAuthTimeout) {
        return __awaiter(this, void 0, void 0, function* () {
            const accounts = {
                offerer: swapData.offerer,
                claimer: swapData.claimer,
                escrowState: this.root.SwapEscrowState(buffer_1.Buffer.from(swapData.paymentHash, "hex")),
                claimerUserData: !swapData.payOut ? this.root.SwapUserVault(swapData.claimer, swapData.token) : null,
                ixSysvar: refundAuthTimeout != null ? web3_js_1.SYSVAR_INSTRUCTIONS_PUBKEY : null
            };
            const useTimeout = refundAuthTimeout != null ? refundAuthTimeout : new BN(0);
            if (swapData.isPayIn()) {
                const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(swapData.token, swapData.offerer);
                return new SolanaAction_1.SolanaAction(swapData.offerer, this.root, yield this.program.methods
                    .offererRefundPayIn(useTimeout)
                    .accounts(Object.assign(Object.assign({}, accounts), { offererAta: ata, vault: this.root.SwapVault(swapData.token), vaultAuthority: this.root.SwapVaultAuthority, tokenProgram: spl_token_1.TOKEN_PROGRAM_ID }))
                    .instruction(), SwapRefund.CUCosts.REFUND_PAY_OUT);
            }
            else {
                return new SolanaAction_1.SolanaAction(swapData.offerer, this.root, yield this.program.methods
                    .offererRefund(useTimeout)
                    .accounts(Object.assign(Object.assign({}, accounts), { offererUserData: this.root.SwapUserVault(swapData.offerer, swapData.token) }))
                    .instruction(), SwapRefund.CUCosts.REFUND);
            }
        });
    }
    /**
     * Action for refunding with signature, adds the Ed25519 verify instruction
     *
     * @param swapData
     * @param timeout
     * @param prefix
     * @param signature
     * @constructor
     * @private
     */
    RefundWithSignature(swapData, timeout, prefix, signature) {
        return __awaiter(this, void 0, void 0, function* () {
            const action = new SolanaAction_1.SolanaAction(swapData.offerer, this.root, web3_js_1.Ed25519Program.createInstructionWithPublicKey({
                message: this.getRefundMessage(swapData, prefix, timeout),
                publicKey: swapData.claimer.toBuffer(),
                signature: signature
            }), 0, null, null, true);
            action.addAction(yield this.Refund(swapData, new BN(timeout)));
            return action;
        });
    }
    /**
     * Gets the message to be signed as a refund authorization
     *
     * @param swapData
     * @param prefix
     * @param timeout
     * @private
     */
    getRefundMessage(swapData, prefix, timeout) {
        const messageBuffers = [
            buffer_1.Buffer.from(prefix, "ascii"),
            swapData.amount.toArrayLike(buffer_1.Buffer, "le", 8),
            swapData.expiry.toArrayLike(buffer_1.Buffer, "le", 8),
            swapData.sequence.toArrayLike(buffer_1.Buffer, "le", 8),
            buffer_1.Buffer.from(swapData.paymentHash, "hex"),
            new BN(timeout).toArrayLike(buffer_1.Buffer, "le", 8)
        ];
        return createHash("sha256").update(buffer_1.Buffer.concat(messageBuffers)).digest();
    }
    /**
     * Checks whether we should unwrap the WSOL to SOL when refunding the swap
     *
     * @param swapData
     * @private
     */
    shouldUnwrap(swapData) {
        return swapData.isPayIn() &&
            swapData.token.equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS) &&
            swapData.offerer.equals(swapData.offerer);
    }
    signSwapRefund(signer, swapData, authorizationTimeout) {
        if (signer.keypair == null)
            throw new Error("Unsupported");
        if (!signer.getPublicKey().equals(swapData.claimer))
            throw new Error("Invalid signer, public key mismatch!");
        const authPrefix = "refund";
        const authTimeout = Math.floor(Date.now() / 1000) + authorizationTimeout;
        const messageBuffer = this.getRefundMessage(swapData, authPrefix, authTimeout.toString(10));
        const signature = tweetnacl_1.sign.detached(messageBuffer, signer.keypair.secretKey);
        return Promise.resolve({
            prefix: authPrefix,
            timeout: authTimeout.toString(10),
            signature: buffer_1.Buffer.from(signature).toString("hex")
        });
    }
    isSignatureValid(swapData, timeout, prefix, signature) {
        if (prefix !== "refund")
            throw new base_1.SignatureVerificationError("Invalid prefix");
        const expiryTimestamp = new BN(timeout);
        const currentTimestamp = new BN(Math.floor(Date.now() / 1000));
        const isExpired = expiryTimestamp.sub(currentTimestamp).lt(new BN(this.root.authGracePeriod));
        if (isExpired)
            throw new base_1.SignatureVerificationError("Authorization expired!");
        const signatureBuffer = buffer_1.Buffer.from(signature, "hex");
        const messageBuffer = this.getRefundMessage(swapData, prefix, timeout);
        if (!tweetnacl_1.sign.detached.verify(messageBuffer, signatureBuffer, swapData.claimer.toBuffer())) {
            throw new base_1.SignatureVerificationError("Invalid signature!");
        }
        return Promise.resolve(messageBuffer);
    }
    /**
     * Creates transactions required for refunding timed out swap, also unwraps WSOL to SOL
     *
     * @param swapData swap data to refund
     * @param check whether to check if swap is already expired and refundable
     * @param initAta should initialize ATA if it doesn't exist
     * @param feeRate fee rate to be used for the transactions
     */
    txsRefund(swapData, check, initAta, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (check && !(yield (0, Utils_1.tryWithRetries)(() => this.root.isRequestRefundable(swapData.offerer.toString(), swapData), this.retryPolicy))) {
                throw new base_1.SwapDataVerificationError("Not refundable yet!");
            }
            const shouldInitAta = swapData.isPayIn() && !(yield this.root.Tokens.ataExists(swapData.offererAta));
            if (shouldInitAta && !initAta)
                throw new base_1.SwapDataVerificationError("ATA not initialized");
            if (feeRate == null)
                feeRate = yield this.root.getRefundFeeRate(swapData);
            const shouldUnwrap = this.shouldUnwrap(swapData);
            const action = new SolanaAction_1.SolanaAction(swapData.offerer, this.root);
            if (shouldInitAta) {
                const initAction = this.root.Tokens.InitAta(swapData.offerer, swapData.offerer, swapData.token, swapData.offererAta);
                if (initAction == null)
                    throw new base_1.SwapDataVerificationError("Invalid claimer token account address");
                action.addAction(initAction);
            }
            action.add(yield this.Refund(swapData));
            if (shouldUnwrap)
                action.add(this.root.Tokens.Unwrap(swapData.offerer));
            this.logger.debug("txsRefund(): creating claim transaction, swap: " + swapData.getClaimHash() +
                " initializingAta: " + shouldInitAta + " unwrapping: " + shouldUnwrap);
            return [yield action.tx(feeRate)];
        });
    }
    /**
     * Creates transactions required for refunding the swap with authorization signature, also unwraps WSOL to SOL
     *
     * @param swapData swap data to refund
     * @param timeout signature timeout
     * @param prefix signature prefix of the counterparty
     * @param signature signature of the counterparty
     * @param check whether to check if swap is committed before attempting refund
     * @param initAta should initialize ATA if it doesn't exist
     * @param feeRate fee rate to be used for the transactions
     */
    txsRefundWithAuthorization(swapData, timeout, prefix, signature, check, initAta, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (check && !(yield (0, Utils_1.tryWithRetries)(() => this.root.isCommited(swapData), this.retryPolicy))) {
                throw new base_1.SwapDataVerificationError("Not correctly committed");
            }
            yield (0, Utils_1.tryWithRetries)(() => this.isSignatureValid(swapData, timeout, prefix, signature), this.retryPolicy, (e) => e instanceof base_1.SignatureVerificationError);
            const shouldInitAta = swapData.isPayIn() && !(yield this.root.Tokens.ataExists(swapData.offererAta));
            if (shouldInitAta && !initAta)
                throw new base_1.SwapDataVerificationError("ATA not initialized");
            if (feeRate == null)
                feeRate = yield this.root.getRefundFeeRate(swapData);
            console.log("[SolanaSwapProgram] txsRefundsWithAuthorization: feeRate: ", feeRate);
            const signatureBuffer = buffer_1.Buffer.from(signature, "hex");
            const shouldUnwrap = this.shouldUnwrap(swapData);
            const action = yield this.RefundWithSignature(swapData, timeout, prefix, signatureBuffer);
            if (shouldInitAta) {
                const initAction = this.root.Tokens.InitAta(swapData.offerer, swapData.offerer, swapData.token, swapData.offererAta);
                if (initAction == null)
                    throw new base_1.SwapDataVerificationError("Invalid claimer token account address");
                action.addAction(initAction, 1); //Need to add it after the Ed25519 verify IX, but before the actual refund IX
            }
            if (shouldUnwrap)
                action.add(this.root.Tokens.Unwrap(swapData.offerer));
            this.logger.debug("txsRefundWithAuthorization(): creating claim transaction, swap: " + swapData.getClaimHash() +
                " initializingAta: " + shouldInitAta + " unwrapping: " + shouldUnwrap +
                " auth expiry: " + timeout + " signature: " + signature);
            return [yield action.tx(feeRate)];
        });
    }
    getRefundFeeRate(swapData) {
        const accounts = [];
        if (swapData.payIn) {
            if (swapData.token != null)
                accounts.push(this.root.SwapVault(swapData.token));
            if (swapData.offerer != null)
                accounts.push(swapData.offerer);
            if (swapData.claimer != null)
                accounts.push(swapData.claimer);
            if (swapData.offererAta != null && !swapData.offererAta.equals(web3_js_1.PublicKey.default))
                accounts.push(swapData.offererAta);
        }
        else {
            if (swapData.offerer != null) {
                accounts.push(swapData.offerer);
                if (swapData.token != null)
                    accounts.push(this.root.SwapUserVault(swapData.offerer, swapData.token));
            }
            if (swapData.claimer != null)
                accounts.push(swapData.claimer);
        }
        if (swapData.paymentHash != null)
            accounts.push(this.root.SwapEscrowState(buffer_1.Buffer.from(swapData.paymentHash, "hex")));
        return this.root.Fees.getFeeRate(accounts);
    }
    /**
     * Get the estimated solana transaction fee of the refund transaction, in the worst case scenario in case where the
     *  ATA needs to be initialized again (i.e. adding the ATA rent exempt lamports to the fee)
     */
    getRefundFee(swapData, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            return new BN(swapData == null || swapData.payIn ? SolanaTokens_1.SolanaTokens.SPL_ATA_RENT_EXEMPT : 0).add(yield this.getRawRefundFee(swapData, feeRate));
        });
    }
    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRawRefundFee(swapData, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (swapData == null)
                return new BN(10000);
            feeRate = feeRate || (yield this.getRefundFeeRate(swapData));
            const computeBudget = swapData.payIn ? SwapRefund.CUCosts.REFUND_PAY_OUT : SwapRefund.CUCosts.REFUND;
            return new BN(10000).add(this.root.Fees.getPriorityFee(computeBudget, feeRate));
        });
    }
}
exports.SwapRefund = SwapRefund;
SwapRefund.CUCosts = {
    REFUND: 15000,
    REFUND_PAY_OUT: 50000
};
