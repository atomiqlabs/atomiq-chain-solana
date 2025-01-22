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
exports.SolanaSwapProgram = void 0;
const SolanaSwapData_1 = require("./SolanaSwapData");
const BN = require("bn.js");
const web3_js_1 = require("@solana/web3.js");
const createHash = require("create-hash");
const programIdl = require("./programIdl.json");
const base_1 = require("@atomiqlabs/base");
const spl_token_1 = require("@solana/spl-token");
const SolanaFees_1 = require("../base/modules/SolanaFees");
const SolanaProgramBase_1 = require("../program/SolanaProgramBase");
const SwapInit_1 = require("./modules/SwapInit");
const SolanaDataAccount_1 = require("./modules/SolanaDataAccount");
const SwapRefund_1 = require("./modules/SwapRefund");
const SwapClaim_1 = require("./modules/SwapClaim");
const SolanaLpVault_1 = require("./modules/SolanaLpVault");
const buffer_1 = require("buffer");
const SolanaSigner_1 = require("../wallet/SolanaSigner");
const SolanaKeypairWallet_1 = require("../wallet/SolanaKeypairWallet");
function toPublicKeyOrNull(str) {
    return str == null ? null : new web3_js_1.PublicKey(str);
}
class SolanaSwapProgram extends SolanaProgramBase_1.SolanaProgramBase {
    constructor(connection, btcRelay, storage, programAddress, retryPolicy, solanaFeeEstimator = btcRelay.Fees || new SolanaFees_1.SolanaFees(connection)) {
        super(connection, programIdl, programAddress, retryPolicy, solanaFeeEstimator);
        ////////////////////////
        //// Constants
        this.ESCROW_STATE_RENT_EXEMPT = 2658720;
        ////////////////////////
        //// PDA accessors
        this.SwapVaultAuthority = this.pda("authority");
        this.SwapVault = this.pda("vault", (tokenAddress) => [tokenAddress.toBuffer()]);
        this.SwapUserVault = this.pda("uservault", (publicKey, tokenAddress) => [publicKey.toBuffer(), tokenAddress.toBuffer()]);
        this.SwapEscrowState = this.pda("state", (hash) => [hash]);
        ////////////////////////
        //// Timeouts
        this.chainId = "SOLANA";
        this.claimWithSecretTimeout = 45;
        this.claimWithTxDataTimeout = 120;
        this.refundTimeout = 45;
        this.claimGracePeriod = 10 * 60;
        this.refundGracePeriod = 10 * 60;
        this.authGracePeriod = 5 * 60;
        this.Init = new SwapInit_1.SwapInit(this);
        this.Refund = new SwapRefund_1.SwapRefund(this);
        this.Claim = new SwapClaim_1.SwapClaim(this, btcRelay);
        this.DataAccount = new SolanaDataAccount_1.SolanaDataAccount(this, storage);
        this.LpVault = new SolanaLpVault_1.SolanaLpVault(this);
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.DataAccount.init();
        });
    }
    getClaimableDeposits(signer) {
        return this.DataAccount.getDataAccountsInfo(new web3_js_1.PublicKey(signer));
    }
    claimDeposits(signer) {
        return this.DataAccount.sweepDataAccounts(signer);
    }
    ////////////////////////////////////////////
    //// Signatures
    preFetchForInitSignatureVerification(data) {
        return this.Init.preFetchForInitSignatureVerification(data);
    }
    preFetchBlockDataForSignatures() {
        return this.Init.preFetchBlockDataForSignatures();
    }
    getInitSignature(signer, swapData, authorizationTimeout, preFetchedBlockData, feeRate) {
        return this.Init.signSwapInitialization(signer, swapData, authorizationTimeout, preFetchedBlockData, feeRate);
    }
    isValidInitAuthorization(swapData, { timeout, prefix, signature }, feeRate, preFetchedData) {
        return this.Init.isSignatureValid(swapData, timeout, prefix, signature, feeRate, preFetchedData);
    }
    getInitAuthorizationExpiry(swapData, { timeout, prefix, signature }, preFetchedData) {
        return this.Init.getSignatureExpiry(timeout, signature, preFetchedData);
    }
    isInitAuthorizationExpired(swapData, { timeout, prefix, signature }) {
        return this.Init.isSignatureExpired(signature, timeout);
    }
    getRefundSignature(signer, swapData, authorizationTimeout) {
        return this.Refund.signSwapRefund(signer, swapData, authorizationTimeout);
    }
    isValidRefundAuthorization(swapData, { timeout, prefix, signature }) {
        return this.Refund.isSignatureValid(swapData, timeout, prefix, signature);
    }
    getDataSignature(signer, data) {
        return this.Signatures.getDataSignature(signer, data);
    }
    isValidDataSignature(data, signature, publicKey) {
        return this.Signatures.isValidDataSignature(data, signature, publicKey);
    }
    ////////////////////////////////////////////
    //// Swap data utils
    /**
     * Checks whether the claim is claimable by us, that means not expired, we are claimer & the swap is commited
     *
     * @param signer
     * @param data
     */
    isClaimable(signer, data) {
        if (!data.isClaimer(signer))
            return Promise.resolve(false);
        if (this.isExpired(signer, data))
            return Promise.resolve(false);
        return this.isCommited(data);
    }
    /**
     * Checks whether a swap is commited, i.e. the swap still exists on-chain and was not claimed nor refunded
     *
     * @param swapData
     */
    isCommited(swapData) {
        return __awaiter(this, void 0, void 0, function* () {
            const paymentHash = buffer_1.Buffer.from(swapData.paymentHash, "hex");
            const account = yield this.program.account.escrowState.fetchNullable(this.SwapEscrowState(paymentHash));
            if (account == null)
                return false;
            return swapData.correctPDA(account);
        });
    }
    /**
     * Checks whether the swap is expired, takes into consideration possible on-chain time skew, therefore for claimer
     *  the swap expires a bit sooner than it should've & for the offerer it expires a bit later
     *
     * @param signer
     * @param data
     */
    isExpired(signer, data) {
        let currentTimestamp = new BN(Math.floor(Date.now() / 1000));
        if (data.isClaimer(signer))
            currentTimestamp = currentTimestamp.sub(new BN(this.refundGracePeriod));
        if (data.isOfferer(signer))
            currentTimestamp = currentTimestamp.add(new BN(this.claimGracePeriod));
        return data.expiry.lt(currentTimestamp);
    }
    /**
     * Checks if the swap is refundable by us, checks if we are offerer, if the swap is already expired & if the swap
     *  is still commited
     *
     * @param signer
     * @param data
     */
    isRequestRefundable(signer, data) {
        //Swap can only be refunded by the offerer
        if (!data.isOfferer(signer))
            return Promise.resolve(false);
        if (!this.isExpired(signer, data))
            return Promise.resolve(false);
        return this.isCommited(data);
    }
    /**
     * Get the swap payment hash to be used for an on-chain swap, this just uses a sha256 hash of the values
     *
     * @param outputScript output script required to claim the swap
     * @param amount sats sent required to claim the swap
     * @param nonce swap nonce uniquely identifying the transaction to prevent replay attacks
     */
    getHashForOnchain(outputScript, amount, nonce) {
        return createHash("sha256").update(buffer_1.Buffer.concat([
            buffer_1.Buffer.from(nonce.toArray("le", 8)),
            buffer_1.Buffer.from(amount.toArray("le", 8)),
            outputScript
        ])).digest();
    }
    ////////////////////////////////////////////
    //// Swap data getters
    /**
     * Gets the status of the specific swap, this also checks if we are offerer/claimer & checks for expiry (to see
     *  if swap is refundable)
     *
     * @param signer
     * @param data
     */
    getCommitStatus(signer, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const escrowStateKey = this.SwapEscrowState(buffer_1.Buffer.from(data.paymentHash, "hex"));
            const escrowState = yield this.program.account.escrowState.fetchNullable(escrowStateKey);
            if (escrowState != null) {
                if (data.correctPDA(escrowState)) {
                    if (data.isOfferer(signer) && this.isExpired(signer, data))
                        return base_1.SwapCommitStatus.REFUNDABLE;
                    return base_1.SwapCommitStatus.COMMITED;
                }
                if (data.isOfferer(signer) && this.isExpired(signer, data))
                    return base_1.SwapCommitStatus.EXPIRED;
                return base_1.SwapCommitStatus.NOT_COMMITED;
            }
            //Check if paid or what
            const status = yield this.Events.findInEvents(escrowStateKey, (event) => __awaiter(this, void 0, void 0, function* () {
                if (event.name === "ClaimEvent") {
                    if (!event.data.sequence.eq(data.sequence))
                        return null;
                    return base_1.SwapCommitStatus.PAID;
                }
                if (event.name === "RefundEvent") {
                    if (!event.data.sequence.eq(data.sequence))
                        return null;
                    if (this.isExpired(signer, data))
                        return base_1.SwapCommitStatus.EXPIRED;
                    return base_1.SwapCommitStatus.NOT_COMMITED;
                }
            }));
            if (status != null)
                return status;
            if (this.isExpired(signer, data)) {
                return base_1.SwapCommitStatus.EXPIRED;
            }
            return base_1.SwapCommitStatus.NOT_COMMITED;
        });
    }
    /**
     * Checks the status of the specific payment hash
     *
     * @param paymentHash
     */
    getPaymentHashStatus(paymentHash) {
        return __awaiter(this, void 0, void 0, function* () {
            const escrowStateKey = this.SwapEscrowState(buffer_1.Buffer.from(paymentHash, "hex"));
            const abortController = new AbortController();
            //Start fetching events before checking escrow PDA, this call is used when quoting, so saving 100ms here helps a lot!
            const eventsPromise = this.Events.findInEvents(escrowStateKey, (event) => __awaiter(this, void 0, void 0, function* () {
                if (event.name === "ClaimEvent")
                    return base_1.SwapCommitStatus.PAID;
                if (event.name === "RefundEvent")
                    return base_1.SwapCommitStatus.NOT_COMMITED;
            }), abortController.signal).catch(e => {
                abortController.abort(e);
                return null;
            });
            const escrowState = yield this.program.account.escrowState.fetchNullable(escrowStateKey);
            abortController.signal.throwIfAborted();
            if (escrowState != null) {
                abortController.abort();
                return base_1.SwapCommitStatus.COMMITED;
            }
            //Check if paid or what
            const eventsStatus = yield eventsPromise;
            abortController.signal.throwIfAborted();
            if (eventsStatus != null)
                return eventsStatus;
            return base_1.SwapCommitStatus.NOT_COMMITED;
        });
    }
    /**
     * Returns the data committed for a specific payment hash, or null if no data is currently commited for
     *  the specific swap
     *
     * @param paymentHashHex
     */
    getCommitedData(paymentHashHex) {
        return __awaiter(this, void 0, void 0, function* () {
            const paymentHash = buffer_1.Buffer.from(paymentHashHex, "hex");
            const account = yield this.program.account.escrowState.fetchNullable(this.SwapEscrowState(paymentHash));
            if (account == null)
                return null;
            return SolanaSwapData_1.SolanaSwapData.fromEscrowState(account);
        });
    }
    ////////////////////////////////////////////
    //// Swap data initializer
    createSwapData(type, offerer, claimer, token, amount, paymentHash, sequence, expiry, escrowNonce, confirmations, payIn, payOut, securityDeposit, claimerBounty) {
        const tokenAddr = new web3_js_1.PublicKey(token);
        const offererKey = offerer == null ? null : new web3_js_1.PublicKey(offerer);
        const claimerKey = claimer == null ? null : new web3_js_1.PublicKey(claimer);
        return Promise.resolve(new SolanaSwapData_1.SolanaSwapData(offererKey, claimerKey, tokenAddr, amount, paymentHash, sequence, expiry, escrowNonce, confirmations, payOut, type == null ? null : SolanaSwapData_1.SolanaSwapData.typeToKind(type), payIn, offererKey == null ? null : payIn ? (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAddr, offererKey) : web3_js_1.PublicKey.default, claimerKey == null ? null : payOut ? (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAddr, claimerKey) : web3_js_1.PublicKey.default, securityDeposit, claimerBounty, null));
    }
    ////////////////////////////////////////////
    //// Utils
    getBalance(signer, tokenAddress, inContract) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = new web3_js_1.PublicKey(tokenAddress);
            const publicKey = new web3_js_1.PublicKey(signer);
            if (inContract)
                return yield this.getIntermediaryBalance(publicKey, token);
            let { balance, ataExists } = yield this.Tokens.getTokenBalance(publicKey, token);
            // if(token.equals(this.Tokens.WSOL_ADDRESS) && !ataExists) {
            //     const feeCosts = new BN(this.Tokens.SPL_ATA_RENT_EXEMPT);
            //     balance = BN.max(balance.sub(feeCosts), new BN(0));
            // }
            this.logger.debug("getBalance(): token balance, token: " + token.toBase58() + " balance: " + balance.toString(10));
            return balance;
        });
    }
    getIntermediaryData(address, token) {
        return this.LpVault.getIntermediaryData(new web3_js_1.PublicKey(address), new web3_js_1.PublicKey(token));
    }
    getIntermediaryReputation(address, token) {
        return this.LpVault.getIntermediaryReputation(new web3_js_1.PublicKey(address), new web3_js_1.PublicKey(token));
    }
    getIntermediaryBalance(address, token) {
        return this.LpVault.getIntermediaryBalance(address, token);
    }
    isValidAddress(address) {
        return this.Addresses.isValidAddress(address);
    }
    getNativeCurrencyAddress() {
        return this.Tokens.getNativeCurrencyAddress().toString();
    }
    ////////////////////////////////////////////
    //// Transaction initializers
    txsClaimWithSecret(signer, swapData, secret, checkExpiry, initAta, feeRate, skipAtaCheck) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.Claim.txsClaimWithSecret(typeof (signer) === "string" ? new web3_js_1.PublicKey(signer) : signer.getPublicKey(), swapData, secret, checkExpiry, initAta, feeRate, skipAtaCheck);
        });
    }
    txsClaimWithTxData(signer, swapData, blockheight, tx, vout, commitedHeader, synchronizer, initAta, feeRate, storageAccHolder) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.Claim.txsClaimWithTxData(typeof (signer) === "string" ? new web3_js_1.PublicKey(signer) : signer, swapData, blockheight, tx, vout, commitedHeader, synchronizer, initAta, storageAccHolder, feeRate);
        });
    }
    txsRefund(swapData, check, initAta, feeRate) {
        return this.Refund.txsRefund(swapData, check, initAta, feeRate);
    }
    txsRefundWithAuthorization(swapData, { timeout, prefix, signature }, check, initAta, feeRate) {
        return this.Refund.txsRefundWithAuthorization(swapData, timeout, prefix, signature, check, initAta, feeRate);
    }
    txsInitPayIn(swapData, { timeout, prefix, signature }, skipChecks, feeRate) {
        return this.Init.txsInitPayIn(swapData, timeout, prefix, signature, skipChecks, feeRate);
    }
    txsInit(swapData, { timeout, prefix, signature }, txoHash, skipChecks, feeRate) {
        return this.Init.txsInit(swapData, timeout, prefix, signature, skipChecks, feeRate);
    }
    txsWithdraw(signer, token, amount, feeRate) {
        return this.LpVault.txsWithdraw(new web3_js_1.PublicKey(signer), new web3_js_1.PublicKey(token), amount, feeRate);
    }
    txsDeposit(signer, token, amount, feeRate) {
        return this.LpVault.txsDeposit(new web3_js_1.PublicKey(signer), new web3_js_1.PublicKey(token), amount, feeRate);
    }
    txsTransfer(signer, token, amount, dstAddress, feeRate) {
        return this.Tokens.txsTransfer(new web3_js_1.PublicKey(signer), new web3_js_1.PublicKey(token), amount, new web3_js_1.PublicKey(dstAddress), feeRate);
    }
    ////////////////////////////////////////////
    //// Executors
    claimWithSecret(signer, swapData, secret, checkExpiry, initAta, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, checkExpiry, initAta, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            const [signature] = yield this.Transactions.sendAndConfirm(signer, result, txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal);
            return signature;
        });
    }
    claimWithTxData(signer, swapData, blockheight, tx, vout, commitedHeader, synchronizer, initAta, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = {
                storageAcc: null
            };
            const txs = yield this.Claim.txsClaimWithTxData(signer, swapData, blockheight, tx, vout, commitedHeader, synchronizer, initAta, data, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            if (txs === null)
                throw new Error("Btc relay not synchronized to required blockheight!");
            //TODO: This doesn't return proper tx signature
            const [signature] = yield this.Transactions.sendAndConfirm(signer, txs, txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal);
            yield this.DataAccount.removeDataAccount(data.storageAcc);
            return signature;
        });
    }
    refund(signer, swapData, check, initAta, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!signer.getPublicKey().equals(swapData.offerer))
                throw new Error("Invalid signer provided!");
            let result = yield this.txsRefund(swapData, check, initAta, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            const [signature] = yield this.Transactions.sendAndConfirm(signer, result, txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal);
            return signature;
        });
    }
    refundWithAuthorization(signer, swapData, signature, check, initAta, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!signer.getPublicKey().equals(swapData.offerer))
                throw new Error("Invalid signer provided!");
            let result = yield this.txsRefundWithAuthorization(swapData, signature, check, initAta, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            const [txSignature] = yield this.Transactions.sendAndConfirm(signer, result, txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal);
            return txSignature;
        });
    }
    initPayIn(signer, swapData, signature, skipChecks, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!signer.getPublicKey().equals(swapData.offerer))
                throw new Error("Invalid signer provided!");
            let result = yield this.txsInitPayIn(swapData, signature, skipChecks, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            const signatures = yield this.Transactions.sendAndConfirm(signer, result, txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal);
            return signatures[signatures.length - 1];
        });
    }
    init(signer, swapData, signature, txoHash, skipChecks, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!signer.getPublicKey().equals(swapData.claimer))
                throw new Error("Invalid signer provided!");
            let result = yield this.txsInit(swapData, signature, txoHash, skipChecks, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            const [txSignature] = yield this.Transactions.sendAndConfirm(signer, result, txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal);
            return txSignature;
        });
    }
    initAndClaimWithSecret(signer, swapData, signature, secret, skipChecks, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!signer.getPublicKey().equals(swapData.claimer))
                throw new Error("Invalid signer provided!");
            const txsCommit = yield this.txsInit(swapData, signature, null, skipChecks, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            const txsClaim = yield this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, true, false, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate, true);
            return yield this.Transactions.sendAndConfirm(signer, txsCommit.concat(txsClaim), txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal);
        });
    }
    withdraw(signer, token, amount, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const txs = yield this.LpVault.txsWithdraw(signer.getPublicKey(), new web3_js_1.PublicKey(token), amount, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            const [txId] = yield this.Transactions.sendAndConfirm(signer, txs, txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal, false);
            return txId;
        });
    }
    deposit(signer, token, amount, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const txs = yield this.LpVault.txsDeposit(signer.getPublicKey(), new web3_js_1.PublicKey(token), amount, txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            const [txId] = yield this.Transactions.sendAndConfirm(signer, txs, txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal, false);
            return txId;
        });
    }
    transfer(signer, token, amount, dstAddress, txOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const txs = yield this.Tokens.txsTransfer(signer.getPublicKey(), new web3_js_1.PublicKey(token), amount, new web3_js_1.PublicKey(dstAddress), txOptions === null || txOptions === void 0 ? void 0 : txOptions.feeRate);
            const [txId] = yield this.Transactions.sendAndConfirm(signer, txs, txOptions === null || txOptions === void 0 ? void 0 : txOptions.waitForConfirmation, txOptions === null || txOptions === void 0 ? void 0 : txOptions.abortSignal, false);
            return txId;
        });
    }
    ////////////////////////////////////////////
    //// Transactions
    sendAndConfirm(signer, txs, waitForConfirmation, abortSignal, parallel, onBeforePublish) {
        return this.Transactions.sendAndConfirm(signer, txs, waitForConfirmation, abortSignal, parallel, onBeforePublish);
    }
    serializeTx(tx) {
        return this.Transactions.serializeTx(tx);
    }
    deserializeTx(txData) {
        return this.Transactions.deserializeTx(txData);
    }
    getTxIdStatus(txId) {
        return this.Transactions.getTxIdStatus(txId);
    }
    getTxStatus(tx) {
        return this.Transactions.getTxStatus(tx);
    }
    ////////////////////////////////////////////
    //// Fees
    getInitPayInFeeRate(offerer, claimer, token, paymentHash) {
        return this.Init.getInitPayInFeeRate(toPublicKeyOrNull(offerer), toPublicKeyOrNull(claimer), toPublicKeyOrNull(token), paymentHash);
    }
    getInitFeeRate(offerer, claimer, token, paymentHash) {
        return this.Init.getInitFeeRate(toPublicKeyOrNull(offerer), toPublicKeyOrNull(claimer), toPublicKeyOrNull(token), paymentHash);
    }
    getRefundFeeRate(swapData) {
        return this.Refund.getRefundFeeRate(swapData);
    }
    getClaimFeeRate(signer, swapData) {
        return this.Claim.getClaimFeeRate(new web3_js_1.PublicKey(signer), swapData);
    }
    getClaimFee(signer, swapData, feeRate) {
        return this.Claim.getClaimFee(new web3_js_1.PublicKey(signer), swapData, feeRate);
    }
    getRawClaimFee(signer, swapData, feeRate) {
        return this.Claim.getRawClaimFee(new web3_js_1.PublicKey(signer), swapData, feeRate);
    }
    /**
     * Get the estimated solana fee of the commit transaction
     */
    getCommitFee(swapData, feeRate) {
        return this.Init.getInitFee(swapData, feeRate);
    }
    /**
     * Get the estimated solana fee of the commit transaction, without any deposits
     */
    getRawCommitFee(swapData, feeRate) {
        return this.Init.getRawInitFee(swapData, feeRate);
    }
    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRefundFee(swapData, feeRate) {
        return this.Refund.getRefundFee(swapData, feeRate);
    }
    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRawRefundFee(swapData, feeRate) {
        return this.Refund.getRawRefundFee(swapData, feeRate);
    }
    ///////////////////////////////////
    //// Callbacks & handlers
    offBeforeTxReplace(callback) {
        return true;
    }
    onBeforeTxReplace(callback) { }
    onBeforeTxSigned(callback) {
        this.Transactions.onBeforeTxSigned(callback);
    }
    offBeforeTxSigned(callback) {
        return this.Transactions.offBeforeTxSigned(callback);
    }
    onSendTransaction(callback) {
        this.Transactions.onSendTransaction(callback);
    }
    offSendTransaction(callback) {
        return this.Transactions.offSendTransaction(callback);
    }
    isValidToken(tokenIdentifier) {
        try {
            new web3_js_1.PublicKey(tokenIdentifier);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    randomAddress() {
        return web3_js_1.Keypair.generate().publicKey.toString();
    }
    randomSigner() {
        const keypair = web3_js_1.Keypair.generate();
        const wallet = new SolanaKeypairWallet_1.SolanaKeypairWallet(keypair);
        return new SolanaSigner_1.SolanaSigner(wallet, keypair);
    }
}
exports.SolanaSwapProgram = SolanaSwapProgram;
