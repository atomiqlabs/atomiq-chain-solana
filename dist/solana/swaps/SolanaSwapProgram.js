"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSwapProgram = void 0;
const SolanaSwapData_1 = require("./SolanaSwapData");
const web3_js_1 = require("@solana/web3.js");
const sha2_1 = require("@noble/hashes/sha2");
const programIdl = require("./programIdl.json");
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
function toPublicKeyOrNull(str) {
    return str == null ? null : new web3_js_1.PublicKey(str);
}
const MAX_PARALLEL_COMMIT_STATUS_CHECKS = 5;
class SolanaSwapProgram extends SolanaProgramBase_1.SolanaProgramBase {
    constructor(chainInterface, btcRelay, storage, programAddress) {
        super(chainInterface, programIdl, programAddress);
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
        this.Init = new SwapInit_1.SwapInit(chainInterface, this);
        this.Refund = new SwapRefund_1.SwapRefund(chainInterface, this);
        this.Claim = new SwapClaim_1.SwapClaim(chainInterface, this, btcRelay);
        this.DataAccount = new SolanaDataAccount_1.SolanaDataAccount(chainInterface, this, storage);
        this.LpVault = new SolanaLpVault_1.SolanaLpVault(chainInterface, this);
    }
    async start() {
        await this.DataAccount.init();
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
    isValidInitAuthorization(signer, swapData, { timeout, prefix, signature }, feeRate, preFetchedData) {
        return this.Init.isSignatureValid(signer, swapData, timeout, prefix, signature, feeRate, preFetchedData);
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
        return this.Chain.Signatures.getDataSignature(signer, data);
    }
    isValidDataSignature(data, signature, publicKey) {
        return this.Chain.Signatures.isValidDataSignature(data, signature, publicKey);
    }
    ////////////////////////////////////////////
    //// Swap data utils
    /**
     * Checks whether the claim is claimable by us, that means not expired, we are claimer & the swap is commited
     *
     * @param signer
     * @param data
     */
    async isClaimable(signer, data) {
        if (!data.isClaimer(signer))
            return false;
        if (await this.isExpired(signer, data))
            return false;
        return await this.isCommited(data);
    }
    /**
     * Checks whether a swap is commited, i.e. the swap still exists on-chain and was not claimed nor refunded
     *
     * @param swapData
     */
    async isCommited(swapData) {
        const paymentHash = buffer_1.Buffer.from(swapData.paymentHash, "hex");
        const account = await this.program.account.escrowState.fetchNullable(this.SwapEscrowState(paymentHash));
        if (account == null)
            return false;
        return swapData.correctPDA(account);
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
            currentTimestamp = currentTimestamp.add(new BN(this.claimGracePeriod));
        if (data.isOfferer(signer))
            currentTimestamp = currentTimestamp.sub(new BN(this.refundGracePeriod));
        return Promise.resolve(data.expiry.lt(currentTimestamp));
    }
    /**
     * Checks if the swap is refundable by us, checks if we are offerer, if the swap is already expired & if the swap
     *  is still commited
     *
     * @param signer
     * @param data
     */
    async isRequestRefundable(signer, data) {
        //Swap can only be refunded by the offerer
        if (!data.isOfferer(signer))
            return false;
        if (!(await this.isExpired(signer, data)))
            return false;
        return await this.isCommited(data);
    }
    /**
     * Get the swap payment hash to be used for an on-chain swap, this just uses a sha256 hash of the values
     *
     * @param outputScript output script required to claim the swap
     * @param amount sats sent required to claim the swap
     * @param confirmations
     * @param nonce swap nonce uniquely identifying the transaction to prevent replay attacks
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
    getHashForHtlc(swapHash) {
        return buffer_1.Buffer.from((0, Utils_1.toClaimHash)(swapHash.toString("hex"), 0n, 0), "hex");
    }
    getHashForTxId(txId, confirmations) {
        return buffer_1.Buffer.from((0, Utils_1.toClaimHash)(buffer_1.Buffer.from(txId, "hex").reverse().toString("hex"), 0n, confirmations), "hex");
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
    async getCommitStatus(signer, data) {
        const escrowStateKey = this.SwapEscrowState(buffer_1.Buffer.from(data.paymentHash, "hex"));
        const [escrowState, isExpired] = await Promise.all([
            this.program.account.escrowState.fetchNullable(escrowStateKey),
            this.isExpired(signer, data)
        ]);
        if (escrowState != null) {
            if (data.correctPDA(escrowState)) {
                if (data.isOfferer(signer) && isExpired)
                    return { type: base_1.SwapCommitStateType.REFUNDABLE };
                return { type: base_1.SwapCommitStateType.COMMITED };
            }
            if (data.isOfferer(signer) && isExpired)
                return { type: base_1.SwapCommitStateType.EXPIRED };
            return { type: base_1.SwapCommitStateType.NOT_COMMITED };
        }
        //Check if paid or what
        const status = await this.Events.findInEvents(escrowStateKey, async (event, tx) => {
            if (event.name === "ClaimEvent") {
                const paymentHash = buffer_1.Buffer.from(event.data.hash).toString("hex");
                if (paymentHash !== data.paymentHash)
                    return null;
                if (!event.data.sequence.eq(data.sequence))
                    return null;
                return {
                    type: base_1.SwapCommitStateType.PAID,
                    getClaimTxId: () => Promise.resolve(tx.transaction.signatures[0]),
                    getClaimResult: () => Promise.resolve(buffer_1.Buffer.from(event.data.secret).toString("hex")),
                    getTxBlock: async () => {
                        return {
                            blockHeight: (await this.Chain.Blocks.getParsedBlock(tx.slot)).blockHeight,
                            blockTime: tx.blockTime
                        };
                    }
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
                    getRefundTxId: () => Promise.resolve(tx.transaction.signatures[0]),
                    getTxBlock: async () => {
                        return {
                            blockHeight: (await this.Chain.Blocks.getParsedBlock(tx.slot)).blockHeight,
                            blockTime: tx.blockTime
                        };
                    }
                };
            }
        });
        if (status != null)
            return status;
        if (isExpired)
            return { type: base_1.SwapCommitStateType.EXPIRED };
        return { type: base_1.SwapCommitStateType.NOT_COMMITED };
    }
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
     * Checks the status of the specific payment hash
     *
     * @param claimHash
     */
    async getClaimHashStatus(claimHash) {
        const { paymentHash } = (0, Utils_1.fromClaimHash)(claimHash);
        const escrowStateKey = this.SwapEscrowState(buffer_1.Buffer.from(paymentHash, "hex"));
        const abortController = new AbortController();
        //Start fetching events before checking escrow PDA, this call is used when quoting, so saving 100ms here helps a lot!
        const eventsPromise = this.Events.findInEvents(escrowStateKey, async (event) => {
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
     * Returns the data committed for a specific payment hash, or null if no data is currently commited for
     *  the specific swap
     *
     * @param claimHashHex
     */
    async getCommitedData(claimHashHex) {
        const { paymentHash } = (0, Utils_1.fromClaimHash)(claimHashHex);
        const paymentHashBuffer = buffer_1.Buffer.from(paymentHash, "hex");
        const account = await this.program.account.escrowState.fetchNullable(this.SwapEscrowState(paymentHashBuffer));
        if (account == null)
            return null;
        return SolanaSwapData_1.SolanaSwapData.fromEscrowState(account);
    }
    async getHistoricalSwaps(signer, startBlockheight) {
        let latestBlockheight;
        const events = [];
        await this.Events.findInEvents(new web3_js_1.PublicKey(signer), async (event, tx) => {
            if (latestBlockheight == null)
                latestBlockheight = tx.slot;
            events.push({ event, tx });
        }, undefined, undefined, startBlockheight);
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
                const instructions = this.Events.decodeInstructions(tx.transaction.message);
                if (instructions == null) {
                    this.logger.warn(`getHistoricalSwaps(): Skipping tx ${txSignature} because cannot parse instructions!`);
                    continue;
                }
                const initIx = instructions.find(ix => ix != null && (ix.name === "offererInitializePayIn" || ix.name === "offererInitialize"));
                if (initIx == null) {
                    this.logger.warn(`getHistoricalSwaps(): Skipping tx ${txSignature} because cannot init instruction not found!`);
                    continue;
                }
                swapsOpened[escrowHash] = (0, Utils_1.instructionToSwapData)(initIx, txoHash);
            }
            if (event.name === "ClaimEvent") {
                const foundSwapData = swapsOpened[escrowHash];
                delete swapsOpened[escrowHash];
                resultingSwaps[escrowHash] = {
                    data: foundSwapData,
                    state: {
                        type: base_1.SwapCommitStateType.PAID,
                        getClaimTxId: () => Promise.resolve(txSignature),
                        getClaimResult: () => Promise.resolve(buffer_1.Buffer.from(event.data.secret).toString("hex")),
                        getTxBlock: async () => {
                            return {
                                blockHeight: (await this.Chain.Blocks.getParsedBlock(tx.slot)).blockHeight,
                                blockTime: tx.blockTime
                            };
                        }
                    }
                };
            }
            if (event.name === "RefundEvent") {
                const foundSwapData = swapsOpened[escrowHash];
                delete swapsOpened[escrowHash];
                const isExpired = foundSwapData != null && await this.isExpired(signer, foundSwapData);
                resultingSwaps[escrowHash] = {
                    data: foundSwapData,
                    state: {
                        type: isExpired ? base_1.SwapCommitStateType.EXPIRED : base_1.SwapCommitStateType.NOT_COMMITED,
                        getRefundTxId: () => Promise.resolve(txSignature),
                        getTxBlock: async () => {
                            return {
                                blockHeight: (await this.Chain.Blocks.getParsedBlock(tx.slot)).blockHeight,
                                blockTime: tx.blockTime
                            };
                        }
                    }
                };
            }
        }
        for (let escrowHash in swapsOpened) {
            const foundSwapData = swapsOpened[escrowHash];
            const isExpired = await this.isExpired(signer, foundSwapData);
            resultingSwaps[escrowHash] = {
                data: foundSwapData,
                state: foundSwapData.isOfferer(signer) && isExpired
                    ? { type: base_1.SwapCommitStateType.REFUNDABLE }
                    : { type: base_1.SwapCommitStateType.COMMITED }
            };
        }
        return {
            swaps: resultingSwaps,
            latestBlockheight
        };
    }
    ////////////////////////////////////////////
    //// Swap data initializer
    createSwapData(type, offerer, claimer, token, amount, claimHash, sequence, expiry, payIn, payOut, securityDeposit, claimerBounty, depositToken) {
        if (depositToken != null) {
            if (!new web3_js_1.PublicKey(depositToken).equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS))
                throw new Error("Only SOL supported as deposit token!");
        }
        const tokenAddr = new web3_js_1.PublicKey(token);
        const offererKey = offerer == null ? null : new web3_js_1.PublicKey(offerer);
        const claimerKey = claimer == null ? null : new web3_js_1.PublicKey(claimer);
        const { paymentHash, nonce, confirmations } = (0, Utils_1.fromClaimHash)(claimHash);
        return Promise.resolve(new SolanaSwapData_1.SolanaSwapData(offererKey, claimerKey, tokenAddr, (0, Utils_1.toBN)(amount), paymentHash, (0, Utils_1.toBN)(sequence), (0, Utils_1.toBN)(expiry), nonce, confirmations, payOut, type == null ? null : SolanaSwapData_1.SolanaSwapData.typeToKind(type), payIn, offererKey == null ? null : payIn ? (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAddr, offererKey) : web3_js_1.PublicKey.default, claimerKey == null ? null : payOut ? (0, spl_token_1.getAssociatedTokenAddressSync)(tokenAddr, claimerKey) : web3_js_1.PublicKey.default, (0, Utils_1.toBN)(securityDeposit), (0, Utils_1.toBN)(claimerBounty), null));
    }
    ////////////////////////////////////////////
    //// Utils
    async getBalance(signer, tokenAddress, inContract) {
        if (!inContract) {
            return await this.Chain.getBalance(signer, tokenAddress);
        }
        const token = new web3_js_1.PublicKey(tokenAddress);
        const publicKey = new web3_js_1.PublicKey(signer);
        return await this.getIntermediaryBalance(publicKey, token);
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
    ////////////////////////////////////////////
    //// Transaction initializers
    async txsClaimWithSecret(signer, swapData, secret, checkExpiry, initAta, feeRate, skipAtaCheck) {
        return this.Claim.txsClaimWithSecret(typeof (signer) === "string" ? new web3_js_1.PublicKey(signer) : signer.getPublicKey(), swapData, secret, checkExpiry, initAta, feeRate, skipAtaCheck);
    }
    async txsClaimWithTxData(signer, swapData, tx, requiredConfirmations, vout, commitedHeader, synchronizer, initAta, feeRate, storageAccHolder) {
        if (swapData.confirmations !== requiredConfirmations)
            throw new Error("Invalid requiredConfirmations provided!");
        return this.Claim.txsClaimWithTxData(typeof (signer) === "string" ? new web3_js_1.PublicKey(signer) : signer, swapData, tx, vout, commitedHeader, synchronizer, initAta, storageAccHolder, feeRate);
    }
    txsRefund(signer, swapData, check, initAta, feeRate) {
        if (!swapData.isOfferer(signer))
            throw new Error("Only offerer can refund on Solana");
        return this.Refund.txsRefund(swapData, check, initAta, feeRate);
    }
    txsRefundWithAuthorization(signer, swapData, { timeout, prefix, signature }, check, initAta, feeRate) {
        if (!swapData.isOfferer(signer))
            throw new Error("Only offerer can refund on Solana");
        return this.Refund.txsRefundWithAuthorization(swapData, timeout, prefix, signature, check, initAta, feeRate);
    }
    txsInit(sender, swapData, { timeout, prefix, signature }, skipChecks, feeRate) {
        if (swapData.isPayIn()) {
            if (!swapData.isOfferer(sender))
                throw new Error("Only offerer can create payIn=true swap");
            return this.Init.txsInitPayIn(swapData, timeout, prefix, signature, skipChecks, feeRate);
        }
        else {
            if (!swapData.isClaimer(sender))
                throw new Error("Only claimer can create payIn=false swap");
            return this.Init.txsInit(swapData, timeout, prefix, signature, skipChecks, feeRate);
        }
    }
    txsWithdraw(signer, token, amount, feeRate) {
        return this.LpVault.txsWithdraw(new web3_js_1.PublicKey(signer), new web3_js_1.PublicKey(token), amount, feeRate);
    }
    txsDeposit(signer, token, amount, feeRate) {
        return this.LpVault.txsDeposit(new web3_js_1.PublicKey(signer), new web3_js_1.PublicKey(token), amount, feeRate);
    }
    ////////////////////////////////////////////
    //// Executors
    async claimWithSecret(signer, swapData, secret, checkExpiry, initAta, txOptions) {
        const result = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, checkExpiry, initAta, txOptions?.feeRate);
        const [signature] = await this.Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return signature;
    }
    async claimWithTxData(signer, swapData, tx, requiredConfirmations, vout, commitedHeader, synchronizer, initAta, txOptions) {
        if (requiredConfirmations !== swapData.confirmations)
            throw new Error("Invalid requiredConfirmations provided!");
        const data = {
            storageAcc: null
        };
        const txs = await this.Claim.txsClaimWithTxData(signer, swapData, tx, vout, commitedHeader, synchronizer, initAta, data, txOptions?.feeRate);
        if (txs === null)
            throw new Error("Btc relay not synchronized to required blockheight!");
        //TODO: This doesn't return proper tx signature
        const [signature] = await this.Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        await this.DataAccount.removeDataAccount(data.storageAcc);
        return signature;
    }
    async refund(signer, swapData, check, initAta, txOptions) {
        let result = await this.txsRefund(signer.getAddress(), swapData, check, initAta, txOptions?.feeRate);
        const [signature] = await this.Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return signature;
    }
    async refundWithAuthorization(signer, swapData, signature, check, initAta, txOptions) {
        let result = await this.txsRefundWithAuthorization(signer.getAddress(), swapData, signature, check, initAta, txOptions?.feeRate);
        const [txSignature] = await this.Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return txSignature;
    }
    async init(signer, swapData, signature, skipChecks, txOptions) {
        if (swapData.isPayIn()) {
            if (!signer.getPublicKey().equals(swapData.offerer))
                throw new Error("Invalid signer provided!");
        }
        else {
            if (!signer.getPublicKey().equals(swapData.claimer))
                throw new Error("Invalid signer provided!");
        }
        const result = await this.txsInit(signer.getAddress(), swapData, signature, skipChecks, txOptions?.feeRate);
        const [txSignature] = await this.Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return txSignature;
    }
    async initAndClaimWithSecret(signer, swapData, signature, secret, skipChecks, txOptions) {
        if (!signer.getPublicKey().equals(swapData.claimer))
            throw new Error("Invalid signer provided!");
        const txsCommit = await this.txsInit(signer.getAddress(), swapData, signature, skipChecks, txOptions?.feeRate);
        const txsClaim = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, true, false, txOptions?.feeRate, true);
        return await this.Chain.sendAndConfirm(signer, txsCommit.concat(txsClaim), txOptions?.waitForConfirmation, txOptions?.abortSignal);
    }
    async withdraw(signer, token, amount, txOptions) {
        const txs = await this.LpVault.txsWithdraw(signer.getPublicKey(), new web3_js_1.PublicKey(token), amount, txOptions?.feeRate);
        const [txId] = await this.Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }
    async deposit(signer, token, amount, txOptions) {
        const txs = await this.LpVault.txsDeposit(signer.getPublicKey(), new web3_js_1.PublicKey(token), amount, txOptions?.feeRate);
        const [txId] = await this.Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }
    ////////////////////////////////////////////
    //// Fees
    getInitPayInFeeRate(offerer, claimer, token, claimHash) {
        const paymentHash = claimHash == null ? null : (0, Utils_1.fromClaimHash)(claimHash).paymentHash;
        return this.Init.getInitPayInFeeRate(toPublicKeyOrNull(offerer), toPublicKeyOrNull(claimer), toPublicKeyOrNull(token), paymentHash);
    }
    getInitFeeRate(offerer, claimer, token, claimHash) {
        const paymentHash = claimHash == null ? null : (0, Utils_1.fromClaimHash)(claimHash).paymentHash;
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
    getCommitFee(signer, swapData, feeRate) {
        return this.Init.getInitFee(swapData, feeRate);
    }
    /**
     * Get the estimated solana fee of the commit transaction, without any deposits
     */
    getRawCommitFee(signer, swapData, feeRate) {
        return this.Init.getRawInitFee(swapData, feeRate);
    }
    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRefundFee(signer, swapData, feeRate) {
        return this.Refund.getRefundFee(swapData, feeRate);
    }
    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRawRefundFee(signer, swapData, feeRate) {
        return this.Refund.getRawRefundFee(swapData, feeRate);
    }
    getExtraData(outputScript, amount, confirmations, nonce) {
        return buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.concat([
            base_1.BigIntBufferUtils.toBuffer(amount, "le", 8),
            outputScript
        ])));
    }
}
exports.SolanaSwapProgram = SolanaSwapProgram;
