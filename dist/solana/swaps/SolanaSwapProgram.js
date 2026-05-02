"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSwapProgram = exports.isSwapProgramV2 = exports.isSwapProgramV1 = void 0;
const SolanaSwapData_1 = require("./SolanaSwapData");
const web3_js_1 = require("@solana/web3.js");
const sha2_1 = require("@noble/hashes/sha2");
const programIdlV1 = require("./v1/programIdl.json");
const programIdlV2 = require("./v2/programIdl.json");
const base_1 = require("@atomiqlabs/base");
const spl_token_1 = require("@solana/spl-token");
const SolanaProgramBase_1 = require("../program/SolanaProgramBase");
const SwapInit_1 = require("./modules/SwapInit");
const SolanaDataAccount_1 = require("./modules/SolanaDataAccount");
const SwapRefund_1 = require("./modules/SwapRefund");
const SwapClaim_1 = require("./modules/SwapClaim");
const SolanaLpVault_1 = require("./modules/SolanaLpVault");
const buffer_1 = require("buffer");
const Utils_1 = require("../../utils/Utils");
const SolanaTokens_1 = require("../chain/modules/SolanaTokens");
const BN = require("bn.js");
const SolanaChains_1 = require("../SolanaChains");
function isSwapProgramV1(obj) {
    return obj.idl.version === "0.1.0";
}
exports.isSwapProgramV1 = isSwapProgramV1;
function isSwapProgramV2(obj) {
    return obj.idl.version === "0.2.0";
}
exports.isSwapProgramV2 = isSwapProgramV2;
function toPublicKeyOrNull(str) {
    return str == null ? undefined : new web3_js_1.PublicKey(str);
}
const MAX_PARALLEL_COMMIT_STATUS_CHECKS = 5;
/**
 * Solana swap (escrow manager) program representation handling PrTLC (on-chain) and HTLC (lightning) based swaps.
 *
 * @category Swaps
 */
class SolanaSwapProgram extends SolanaProgramBase_1.SolanaProgramBase {
    constructor(chainInterface, btcRelay, storage, programAddress, bitcoinNetwork, version) {
        version ?? (version = "v1");
        if (bitcoinNetwork != null && programAddress == null) {
            programAddress = SolanaChains_1.SolanaChains[bitcoinNetwork]?.addresses[version ?? "v1"]?.swapContract;
        }
        super(chainInterface, version === "v1" ? programIdlV1 : programIdlV2, programAddress);
        this._SwapVaultAuthority = SolanaSwapProgram._SwapVaultAuthority(this.program.programId); // Only necessary for V1 program
        this._SwapVault = SolanaSwapProgram._SwapVault.bind(this, this.program.programId);
        this._SwapUserVault = SolanaSwapProgram._SwapUserVault.bind(this, this.program.programId);
        this._SwapEscrowState = SolanaSwapProgram._SwapEscrowState.bind(this, this.program.programId);
        ////////////////////////
        //// Timeouts
        /**
         * @inheritDoc
         */
        this.chainId = "SOLANA";
        /**
         * @inheritDoc
         */
        this.claimWithSecretTimeout = 45;
        /**
         * @inheritDoc
         */
        this.claimWithTxDataTimeout = 120;
        /**
         * @inheritDoc
         */
        this.refundTimeout = 45;
        /**
         * Grace period (seconds) applied to claimer-side expiry checks.
         */
        this.claimGracePeriod = 10 * 60;
        /**
         * Grace period (seconds) applied to offerer-side expiry checks.
         */
        this.refundGracePeriod = 10 * 60;
        /**
         * Authorization grace period in seconds.
         * @internal
         */
        this._authGracePeriod = 30;
        this.version = version;
        this.ESCROW_STATE_RENT_EXEMPT = this.version === "v1" ? 2658720 : 2665680;
        this.supportsInitWithoutClaimer = (this.version !== "v1");
        this.Init = new SwapInit_1.SwapInit(chainInterface, this);
        this.Refund = new SwapRefund_1.SwapRefund(chainInterface, this);
        this.Claim = new SwapClaim_1.SwapClaim(chainInterface, this, btcRelay);
        this._DataAccount = new SolanaDataAccount_1.SolanaDataAccount(chainInterface, this, storage);
        this.LpVault = new SolanaLpVault_1.SolanaLpVault(chainInterface, this);
    }
    /**
     * @inheritDoc
     */
    async start() {
        await this._DataAccount.init();
    }
    /**
     * @inheritDoc
     */
    getClaimableDeposits(signer) {
        return this._DataAccount.getDataAccountsInfo(new web3_js_1.PublicKey(signer));
    }
    /**
     * @inheritDoc
     */
    claimDeposits(signer) {
        return this._DataAccount.sweepDataAccounts(signer);
    }
    ////////////////////////////////////////////
    //// Signatures
    /**
     * @inheritDoc
     */
    preFetchForInitSignatureVerification(data) {
        return this.Init.preFetchForInitSignatureVerification(data);
    }
    /**
     * @inheritDoc
     */
    preFetchBlockDataForSignatures() {
        return this.Init.preFetchBlockDataForSignatures();
    }
    /**
     * @inheritDoc
     */
    getInitSignature(signer, swapData, authorizationTimeout, preFetchedBlockData, feeRate) {
        return this.Init.signSwapInitialization(signer, swapData, authorizationTimeout, preFetchedBlockData, feeRate);
    }
    /**
     * @inheritDoc
     */
    isValidInitAuthorization(signer, swapData, sig, feeRate, preFetchedData) {
        return this.Init.isSignatureValid(new web3_js_1.PublicKey(signer), swapData, sig.timeout, sig.prefix, sig.signature, feeRate, preFetchedData);
    }
    /**
     * @inheritDoc
     */
    getInitAuthorizationExpiry(swapData, sig, preFetchedData) {
        return this.Init.getSignatureExpiry(sig.timeout, sig.signature, preFetchedData);
    }
    /**
     * @inheritDoc
     */
    isInitAuthorizationExpired(swapData, sig) {
        return this.Init.isSignatureExpired(sig.signature, sig.timeout);
    }
    /**
     * @inheritDoc
     */
    getRefundSignature(signer, swapData, authorizationTimeout) {
        return this.Refund.signSwapRefund(signer, swapData, authorizationTimeout);
    }
    /**
     * @inheritDoc
     */
    isValidRefundAuthorization(swapData, sig) {
        return this.Refund.isSignatureValid(swapData, sig.timeout, sig.prefix, sig.signature);
    }
    /**
     * @inheritDoc
     */
    getDataSignature(signer, data) {
        return this._Chain.Signatures.getDataSignature(signer, data);
    }
    /**
     * @inheritDoc
     */
    isValidDataSignature(data, signature, publicKey) {
        return this._Chain.Signatures.isValidDataSignature(data, signature, publicKey);
    }
    ////////////////////////////////////////////
    //// Swap data utils
    /**
     * @inheritDoc
     */
    async isClaimable(signer, data) {
        if (!data.isClaimer(signer))
            return false;
        if (await this.isExpired(signer, data))
            return false;
        return await this.isCommited(data);
    }
    /**
     * @inheritDoc
     */
    async isCommited(swapData) {
        const paymentHash = buffer_1.Buffer.from(swapData.paymentHash, "hex");
        const account = await this.program.account.escrowState.fetchNullable(this._SwapEscrowState(paymentHash));
        if (account == null)
            return false;
        return swapData.correctPDA(account);
    }
    /**
     * @inheritDoc
     */
    isExpired(signer, data, refundSide) {
        let currentTimestamp = new BN(Math.floor(Date.now() / 1000));
        if (data.isClaimer(signer) && !refundSide) {
            currentTimestamp = currentTimestamp.add(new BN(this.claimGracePeriod));
        }
        else {
            currentTimestamp = currentTimestamp.sub(new BN(this.refundGracePeriod));
        }
        return Promise.resolve(data.expiry.lt(currentTimestamp));
    }
    /**
     * @inheritDoc
     */
    async isRequestRefundable(signer, data) {
        //V1 Swap can only be refunded by the offerer
        if (isSwapProgramV1(this.program) && !data.isOfferer(signer))
            return false;
        if (!(await this.isExpired(signer, data, true)))
            return false;
        return await this.isCommited(data);
    }
    /**
     * @inheritDoc
     */
    getHashForOnchain(outputScript, amount, confirmations, nonce) {
        nonce ?? (nonce = 0n);
        const paymentHash = buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.concat([
            base_1.BigIntBufferUtils.toBuffer(nonce, "le", 8),
            base_1.BigIntBufferUtils.toBuffer(amount, "le", 8),
            outputScript
        ]))).toString("hex");
        return buffer_1.Buffer.from((0, Utils_1.toClaimHash)(paymentHash, nonce, confirmations), "hex");
    }
    /**
     * @inheritDoc
     */
    getHashForHtlc(swapHash) {
        return buffer_1.Buffer.from((0, Utils_1.toClaimHash)(swapHash.toString("hex"), 0n, 0), "hex");
    }
    /**
     * @inheritDoc
     */
    getHashForTxId(txId, confirmations) {
        return buffer_1.Buffer.from((0, Utils_1.toClaimHash)(buffer_1.Buffer.from(txId, "hex").reverse().toString("hex"), 0n, confirmations), "hex");
    }
    ////////////////////////////////////////////
    //// Swap data getters
    /**
     * @inheritDoc
     */
    async getCommitStatus(signer, data) {
        const escrowStateKey = this._SwapEscrowState(buffer_1.Buffer.from(data.paymentHash, "hex"));
        const [escrowState, isExpired] = await Promise.all([
            this.program.account.escrowState.fetchNullable(escrowStateKey),
            this.isExpired(signer, data)
        ]);
        const getInitTxId = (0, Utils_1.onceAsync)(async () => {
            const txId = await this._Events.findInEvents(escrowStateKey, async (event, tx) => {
                if (event.name === "InitializeEvent") {
                    const paymentHash = buffer_1.Buffer.from(event.data.hash).toString("hex");
                    if (paymentHash !== data.paymentHash)
                        return null;
                    if (!event.data.sequence.eq(data.sequence))
                        return null;
                    return tx.transaction.signatures[0];
                }
            });
            if (txId == null)
                throw new Error("Initialize event not found!");
            return txId;
        });
        if (escrowState != null) {
            if (data.correctPDA(escrowState)) {
                if (data.isOfferer(signer) && isExpired)
                    return { type: base_1.SwapCommitStateType.REFUNDABLE, getInitTxId };
                return { type: base_1.SwapCommitStateType.COMMITED, getInitTxId };
            }
            if (data.isOfferer(signer) && isExpired)
                return { type: base_1.SwapCommitStateType.EXPIRED };
            return { type: base_1.SwapCommitStateType.NOT_COMMITED };
        }
        //Check if paid or what
        const status = await this._Events.findInEvents(escrowStateKey, async (event, tx) => {
            if (event.name === "ClaimEvent") {
                const paymentHash = buffer_1.Buffer.from(event.data.hash).toString("hex");
                if (paymentHash !== data.paymentHash)
                    return null;
                if (!event.data.sequence.eq(data.sequence))
                    return null;
                return {
                    type: base_1.SwapCommitStateType.PAID,
                    getInitTxId,
                    getClaimTxId: () => Promise.resolve(tx.transaction.signatures[0]),
                    getClaimResult: () => Promise.resolve(buffer_1.Buffer.from(event.data.secret).toString("hex")),
                    getTxBlock: () => Promise.resolve({
                        blockHeight: tx.slot,
                        blockTime: tx.blockTime
                    })
                };
            }
            if (event.name === "RefundEvent") {
                const paymentHash = buffer_1.Buffer.from(event.data.hash).toString("hex");
                if (paymentHash !== data.paymentHash)
                    return null;
                if (!event.data.sequence.eq(data.sequence))
                    return null;
                return {
                    type: isExpired ? base_1.SwapCommitStateType.EXPIRED : base_1.SwapCommitStateType.NOT_COMMITED,
                    getInitTxId,
                    getRefundTxId: () => Promise.resolve(tx.transaction.signatures[0]),
                    getTxBlock: () => Promise.resolve({
                        blockHeight: tx.slot,
                        blockTime: tx.blockTime
                    })
                };
            }
        });
        if (status != null)
            return status;
        if (isExpired)
            return { type: base_1.SwapCommitStateType.EXPIRED };
        return { type: base_1.SwapCommitStateType.NOT_COMMITED };
    }
    /**
     * @inheritDoc
     */
    async getCommitStatuses(request) {
        const result = {};
        let promises = [];
        for (let { signer, swapData } of request) {
            promises.push(this.getCommitStatus(signer, swapData).then(val => {
                result[swapData.getEscrowHash()] = val;
            }));
            if (promises.length >= MAX_PARALLEL_COMMIT_STATUS_CHECKS) {
                await Promise.all(promises);
                promises = [];
            }
        }
        await Promise.all(promises);
        return result;
    }
    /**
     * @inheritDoc
     */
    async getClaimHashStatus(claimHash) {
        const { paymentHash } = (0, Utils_1.fromClaimHash)(claimHash);
        const escrowStateKey = this._SwapEscrowState(buffer_1.Buffer.from(paymentHash, "hex"));
        const abortController = new AbortController();
        //Start fetching events before checking escrow PDA, this call is used when quoting, so saving 100ms here helps a lot!
        const eventsPromise = this._Events.findInEvents(escrowStateKey, async (event) => {
            if (event.name === "ClaimEvent")
                return base_1.SwapCommitStateType.PAID;
            if (event.name === "RefundEvent")
                return base_1.SwapCommitStateType.NOT_COMMITED;
        }, abortController.signal).catch(e => {
            abortController.abort(e);
            return null;
        });
        const escrowState = await this.program.account.escrowState.fetchNullable(escrowStateKey);
        abortController.signal.throwIfAborted();
        if (escrowState != null) {
            abortController.abort();
            return base_1.SwapCommitStateType.COMMITED;
        }
        //Check if paid or what
        const eventsStatus = await eventsPromise;
        abortController.signal.throwIfAborted();
        if (eventsStatus != null)
            return eventsStatus;
        return base_1.SwapCommitStateType.NOT_COMMITED;
    }
    /**
     * @inheritDoc
     */
    async getCommitedData(claimHashHex) {
        const { paymentHash } = (0, Utils_1.fromClaimHash)(claimHashHex);
        const paymentHashBuffer = buffer_1.Buffer.from(paymentHash, "hex");
        const account = await this.program.account.escrowState.fetchNullable(this._SwapEscrowState(paymentHashBuffer));
        if (account == null)
            return null;
        return SolanaSwapData_1.SolanaSwapData.fromEscrowState(this.program.programId, this.version, account);
    }
    /**
     * @inheritDoc
     */
    async getHistoricalSwaps(signer, startBlockheight) {
        let latestBlockheight;
        const events = [];
        await this._Events.findInEvents(new web3_js_1.PublicKey(signer), async (event, tx) => {
            if (latestBlockheight == null)
                latestBlockheight = tx.slot;
            events.push({ event, tx });
        }, undefined, undefined, startBlockheight);
        this.logger.debug(`getHistoricalSwaps(): Found ${events.length} atomiq related events!`);
        const swapsOpened = {};
        const resultingSwaps = {};
        events.reverse();
        for (let { event, tx } of events) {
            const txSignature = tx.transaction.signatures[0];
            const paymentHash = buffer_1.Buffer.from(event.data.hash).toString("hex");
            const escrowHash = (0, Utils_1.toEscrowHash)(paymentHash, event.data.sequence);
            if (event.name === "InitializeEvent") {
                //Parse swap data from initialize event
                const txoHash = buffer_1.Buffer.from(event.data.txoHash).toString("hex");
                const instructions = this._Events.decodeInstructions(tx.transaction.message);
                if (instructions == null) {
                    this.logger.warn(`getHistoricalSwaps(): Skipping tx ${txSignature} because cannot parse instructions!`);
                    continue;
                }
                const initIx = instructions.find(ix => ix != null && (ix.name === "offererInitializePayIn" || ix.name === "offererInitialize"));
                if (initIx == null) {
                    this.logger.warn(`getHistoricalSwaps(): Skipping tx ${txSignature} because init instruction not found!`);
                    continue;
                }
                swapsOpened[escrowHash] = {
                    data: SolanaSwapData_1.SolanaSwapData.fromInstruction(this.program.programId, this.version, initIx, txoHash),
                    getInitTxId: () => Promise.resolve(txSignature),
                    getTxBlock: () => Promise.resolve({
                        blockHeight: tx.slot,
                        blockTime: tx.blockTime
                    })
                };
            }
            if (event.name === "ClaimEvent") {
                const foundSwapData = swapsOpened[escrowHash];
                delete swapsOpened[escrowHash];
                resultingSwaps[escrowHash] = {
                    init: foundSwapData,
                    state: {
                        type: base_1.SwapCommitStateType.PAID,
                        getInitTxId: foundSwapData?.getInitTxId,
                        getClaimTxId: () => Promise.resolve(txSignature),
                        getClaimResult: () => Promise.resolve(buffer_1.Buffer.from(event.data.secret).toString("hex")),
                        getTxBlock: () => Promise.resolve({
                            blockHeight: tx.slot,
                            blockTime: tx.blockTime
                        })
                    }
                };
            }
            if (event.name === "RefundEvent") {
                const foundSwapData = swapsOpened[escrowHash];
                delete swapsOpened[escrowHash];
                const isExpired = foundSwapData != null && await this.isExpired(signer, foundSwapData.data);
                resultingSwaps[escrowHash] = {
                    init: foundSwapData,
                    state: {
                        type: isExpired ? base_1.SwapCommitStateType.EXPIRED : base_1.SwapCommitStateType.NOT_COMMITED,
                        getInitTxId: foundSwapData?.getInitTxId,
                        getRefundTxId: () => Promise.resolve(txSignature),
                        getTxBlock: () => Promise.resolve({
                            blockHeight: tx.slot,
                            blockTime: tx.blockTime
                        })
                    }
                };
            }
        }
        this.logger.debug(`getHistoricalSwaps(): Found ${Object.keys(resultingSwaps).length} settled swaps!`);
        this.logger.debug(`getHistoricalSwaps(): Found ${Object.keys(swapsOpened).length} unsettled swaps!`);
        for (let escrowHash in swapsOpened) {
            const foundSwapData = swapsOpened[escrowHash];
            const isExpired = await this.isExpired(signer, foundSwapData.data);
            resultingSwaps[escrowHash] = {
                init: foundSwapData,
                state: foundSwapData.data.isOfferer(signer) && isExpired
                    ? { type: base_1.SwapCommitStateType.REFUNDABLE, getInitTxId: foundSwapData.getInitTxId }
                    : { type: base_1.SwapCommitStateType.COMMITED, getInitTxId: foundSwapData.getInitTxId }
            };
        }
        return {
            swaps: resultingSwaps,
            latestBlockheight: latestBlockheight ?? startBlockheight
        };
    }
    ////////////////////////////////////////////
    //// Swap data initializer
    /**
     * @inheritDoc
     */
    createSwapData(type, offerer, claimer, token, amount, claimHash, sequence, expiry, payIn, payOut, securityDeposit, claimerBounty, depositToken) {
        if (depositToken != null) {
            if (!new web3_js_1.PublicKey(depositToken).equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS))
                throw new Error("Only SOL supported as deposit token!");
        }
        const tokenAddr = new web3_js_1.PublicKey(token);
        const offererKey = new web3_js_1.PublicKey(offerer);
        const claimerKey = new web3_js_1.PublicKey(claimer);
        const { paymentHash, nonce, confirmations } = (0, Utils_1.fromClaimHash)(claimHash);
        const swapData = new SolanaSwapData_1.SolanaSwapData({
            programId: this.program.programId,
            version: this.version,
            offerer: offererKey,
            claimer: claimerKey,
            token: tokenAddr,
            amount: (0, Utils_1.toBN)(amount),
            paymentHash,
            sequence: (0, Utils_1.toBN)(sequence),
            expiry: (0, Utils_1.toBN)(expiry),
            nonce,
            confirmations,
            payOut,
            kind: SolanaSwapData_1.SolanaSwapData.typeToKind(type),
            payIn,
            offererAta: payIn ? (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAddr, offererKey) : web3_js_1.PublicKey.default,
            claimerAta: payOut ? (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAddr, claimerKey) : web3_js_1.PublicKey.default,
            securityDeposit: (0, Utils_1.toBN)(securityDeposit),
            claimerBounty: (0, Utils_1.toBN)(claimerBounty)
        });
        return Promise.resolve(swapData);
    }
    ////////////////////////////////////////////
    //// Utils
    /**
     * @inheritDoc
     */
    async getBalance(signer, tokenAddress, inContract) {
        if (!inContract) {
            return await this._Chain.getBalance(signer, tokenAddress);
        }
        const token = new web3_js_1.PublicKey(tokenAddress);
        const publicKey = new web3_js_1.PublicKey(signer);
        return await this.getIntermediaryBalance(publicKey, token);
    }
    /**
     * @inheritDoc
     */
    getIntermediaryData(address, token) {
        return this.LpVault.getIntermediaryData(new web3_js_1.PublicKey(address), new web3_js_1.PublicKey(token));
    }
    /**
     * @inheritDoc
     */
    getIntermediaryReputation(address, token) {
        return this.LpVault.getIntermediaryReputation(new web3_js_1.PublicKey(address), new web3_js_1.PublicKey(token));
    }
    /**
     * Returns intermediary vault balance for a specific token.
     *
     * @param address Intermediary address
     * @param token Token mint
     */
    getIntermediaryBalance(address, token) {
        return this.LpVault.getIntermediaryBalance(address, token);
    }
    ////////////////////////////////////////////
    //// Transaction initializers
    /**
     * @inheritDoc
     */
    async txsClaimWithSecret(signer, swapData, secret, checkExpiry, initAta, feeRate, skipAtaCheck) {
        return this.Claim.txsClaimWithSecret(typeof (signer) === "string" ? new web3_js_1.PublicKey(signer) : signer.getPublicKey(), swapData, secret, checkExpiry, initAta, feeRate, skipAtaCheck);
    }
    /**
     * @inheritDoc
     */
    async txsClaimWithTxData(signer, swapData, tx, requiredConfirmations, vout, commitedHeader, synchronizer, initAta, feeRate) {
        if (swapData.confirmations !== requiredConfirmations)
            throw new Error("Invalid requiredConfirmations provided!");
        const { txs } = await this.Claim.txsClaimWithTxData(typeof (signer) === "string" ? new web3_js_1.PublicKey(signer) : signer, swapData, tx, vout, commitedHeader, synchronizer, initAta, feeRate);
        return txs;
    }
    /**
     * @inheritDoc
     */
    txsRefund(signer, swapData, check, initAta, feeRate) {
        return this.Refund.txsRefund(new web3_js_1.PublicKey(signer), swapData, check, initAta, feeRate);
    }
    /**
     * @inheritDoc
     */
    txsRefundWithAuthorization(signer, swapData, sig, check, initAta, feeRate) {
        return this.Refund.txsRefundWithAuthorization(new web3_js_1.PublicKey(signer), swapData, sig.timeout, sig.prefix, sig.signature, check, initAta, feeRate);
    }
    /**
     * @inheritDoc
     */
    txsInit(sender, swapData, sig, skipChecks, feeRate) {
        if (swapData.isPayIn()) {
            return this.Init.txsInitPayIn(new web3_js_1.PublicKey(sender), swapData, sig.timeout, sig.prefix, sig.signature, skipChecks, feeRate);
        }
        else {
            return this.Init.txsInit(new web3_js_1.PublicKey(sender), swapData, sig.timeout, sig.prefix, sig.signature, skipChecks, feeRate);
        }
    }
    /**
     * @inheritDoc
     */
    txsWithdraw(signer, token, amount, feeRate) {
        return this.LpVault.txsWithdraw(new web3_js_1.PublicKey(signer), new web3_js_1.PublicKey(token), amount, feeRate);
    }
    /**
     * @inheritDoc
     */
    txsDeposit(signer, token, amount, feeRate) {
        return this.LpVault.txsDeposit(new web3_js_1.PublicKey(signer), new web3_js_1.PublicKey(token), amount, feeRate);
    }
    ////////////////////////////////////////////
    //// Executors
    /**
     * @inheritDoc
     */
    async claimWithSecret(signer, swapData, secret, checkExpiry, initAta, txOptions) {
        const result = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, checkExpiry, initAta, txOptions?.feeRate);
        const [signature] = await this._Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return signature;
    }
    /**
     * @inheritDoc
     */
    async claimWithTxData(signer, swapData, tx, requiredConfirmations, vout, commitedHeader, synchronizer, initAta, txOptions) {
        if (requiredConfirmations !== swapData.confirmations)
            throw new Error("Invalid requiredConfirmations provided!");
        const { txs, claimTxIndex, storageAcc } = await this.Claim.txsClaimWithTxData(signer, swapData, tx, vout, commitedHeader, synchronizer, initAta, txOptions?.feeRate);
        const signatures = await this._Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        await this._DataAccount.removeDataAccount(storageAcc);
        return signatures[claimTxIndex] ?? signatures[0];
    }
    /**
     * @inheritDoc
     */
    async refund(signer, swapData, check, initAta, txOptions) {
        let result = await this.txsRefund(signer.getAddress(), swapData, check, initAta, txOptions?.feeRate);
        const [signature] = await this._Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return signature;
    }
    /**
     * @inheritDoc
     */
    async refundWithAuthorization(signer, swapData, signature, check, initAta, txOptions) {
        let result = await this.txsRefundWithAuthorization(signer.getAddress(), swapData, signature, check, initAta, txOptions?.feeRate);
        const [txSignature] = await this._Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return txSignature;
    }
    /**
     * @inheritDoc
     */
    async init(signer, swapData, signature, skipChecks, txOptions) {
        const result = await this.txsInit(signer.getAddress(), swapData, signature, skipChecks, txOptions?.feeRate);
        const signatures = await this._Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return signatures[signatures.length - 1];
    }
    /**
     * @inheritDoc
     */
    async initAndClaimWithSecret(signer, swapData, signature, secret, skipChecks, txOptions) {
        if (!signer.getPublicKey().equals(swapData.claimer))
            throw new Error("Invalid signer provided!");
        const txsCommit = await this.txsInit(signer.getAddress(), swapData, signature, skipChecks, txOptions?.feeRate);
        let txsClaim;
        if (isSwapProgramV1(this.program)) {
            // In V1 the initialize instruction has to contain the ATA initialization, hence we can skip checking it in claim
            txsClaim = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, true, false, txOptions?.feeRate, true);
        }
        else {
            // In V2 the initialize instruction doesn't necessarily contain the ATA initialization, hence the claim instruction needs to
            //  check and initialize the ATA if needed
            txsClaim = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, true, true, txOptions?.feeRate, false);
        }
        const signatures = await this._Chain.sendAndConfirm(signer, txsCommit.concat(txsClaim), txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return [signatures[txsCommit.length - 1], signatures[signatures.length - 1]];
    }
    /**
     * @inheritDoc
     */
    async withdraw(signer, token, amount, txOptions) {
        const txs = await this.LpVault.txsWithdraw(signer.getPublicKey(), new web3_js_1.PublicKey(token), amount, txOptions?.feeRate);
        const [txId] = await this._Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }
    /**
     * @inheritDoc
     */
    async deposit(signer, token, amount, txOptions) {
        const txs = await this.LpVault.txsDeposit(signer.getPublicKey(), new web3_js_1.PublicKey(token), amount, txOptions?.feeRate);
        const [txId] = await this._Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }
    ////////////////////////////////////////////
    //// Fees
    /**
     * @inheritDoc
     */
    getInitPayInFeeRate(offerer, claimer, token, claimHash) {
        const paymentHash = claimHash == null ? undefined : (0, Utils_1.fromClaimHash)(claimHash).paymentHash;
        return this.Init.getInitPayInFeeRate(toPublicKeyOrNull(offerer), toPublicKeyOrNull(claimer), toPublicKeyOrNull(token), paymentHash);
    }
    /**
     * @inheritDoc
     */
    getInitFeeRate(offerer, claimer, token, claimHash) {
        const paymentHash = claimHash == null ? undefined : (0, Utils_1.fromClaimHash)(claimHash).paymentHash;
        return this.Init.getInitFeeRate(toPublicKeyOrNull(offerer), toPublicKeyOrNull(claimer), toPublicKeyOrNull(token), paymentHash);
    }
    /**
     * @inheritDoc
     */
    getRefundFeeRate(swapData) {
        return this.Refund.getRefundFeeRate(swapData);
    }
    /**
     * @inheritDoc
     */
    getClaimFeeRate(signer, swapData) {
        return this.Claim.getClaimFeeRate(new web3_js_1.PublicKey(signer), swapData);
    }
    /**
     * @inheritDoc
     */
    getClaimFee(signer, swapData, feeRate) {
        return this.Claim.getClaimFee(new web3_js_1.PublicKey(signer), swapData, feeRate);
    }
    /**
     * @inheritDoc
     */
    getRawClaimFee(signer, swapData, feeRate) {
        return this.Claim.getRawClaimFee(new web3_js_1.PublicKey(signer), swapData, feeRate);
    }
    /**
     * @inheritDoc
     */
    getCommitFee(signer, swapData, feeRate) {
        return this.Init.getInitFee(swapData, feeRate);
    }
    /**
     * @inheritDoc
     */
    getRawCommitFee(signer, swapData, feeRate) {
        return this.Init.getRawInitFee(swapData, feeRate);
    }
    /**
     * @inheritDoc
     */
    getRefundFee(signer, swapData, feeRate) {
        return this.Refund.getRefundFee(swapData, feeRate);
    }
    /**
     * @inheritDoc
     */
    getRawRefundFee(signer, swapData, feeRate) {
        return this.Refund.getRawRefundFee(swapData, feeRate);
    }
    /**
     * @inheritDoc
     */
    getExtraData(outputScript, amount, confirmations, nonce) {
        return buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.concat([
            base_1.BigIntBufferUtils.toBuffer(amount, "le", 8),
            outputScript
        ])));
    }
}
exports.SolanaSwapProgram = SolanaSwapProgram;
////////////////////////
//// PDA accessors
/**
 * PDA of the swap vault authority.
 * @internal
 */
SolanaSwapProgram._SwapVaultAuthority = SolanaProgramBase_1.SolanaProgramBase._pda("authority"); // Only necessary for V1 program
/**
 * PDA helper for global token vault accounts.
 * @internal
 */
SolanaSwapProgram._SwapVault = SolanaProgramBase_1.SolanaProgramBase._pda("vault", (tokenAddress) => [tokenAddress.toBuffer()]);
/**
 * PDA helper for per-user token vault accounts.
 * @internal
 */
SolanaSwapProgram._SwapUserVault = SolanaProgramBase_1.SolanaProgramBase._pda("uservault", (publicKey, tokenAddress) => [publicKey.toBuffer(), tokenAddress.toBuffer()]);
/**
 * PDA helper for escrow state accounts.
 * @internal
 */
SolanaSwapProgram._SwapEscrowState = SolanaProgramBase_1.SolanaProgramBase._pda("state", (hash) => [hash]);
