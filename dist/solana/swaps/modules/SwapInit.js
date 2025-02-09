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
exports.SwapInit = void 0;
const web3_js_1 = require("@solana/web3.js");
const base_1 = require("@atomiqlabs/base");
const BN = require("bn.js");
const SolanaAction_1 = require("../../base/SolanaAction");
const spl_token_1 = require("@solana/spl-token");
const SolanaSwapModule_1 = require("../SolanaSwapModule");
const Utils_1 = require("../../../utils/Utils");
const buffer_1 = require("buffer");
const SolanaTokens_1 = require("../../base/modules/SolanaTokens");
class SwapInit extends SolanaSwapModule_1.SolanaSwapModule {
    constructor() {
        super(...arguments);
        this.SIGNATURE_SLOT_BUFFER = 20;
        this.SIGNATURE_PREFETCH_DATA_VALIDITY = 5000;
    }
    /**
     * bare Init action based on the data passed in swapData
     *
     * @param swapData
     * @param timeout
     * @private
     */
    Init(swapData, timeout) {
        return __awaiter(this, void 0, void 0, function* () {
            const claimerAta = (0, spl_token_1.getAssociatedTokenAddressSync)(swapData.token, swapData.claimer);
            const paymentHash = buffer_1.Buffer.from(swapData.paymentHash, "hex");
            const accounts = {
                claimer: swapData.claimer,
                offerer: swapData.offerer,
                escrowState: this.root.SwapEscrowState(paymentHash),
                mint: swapData.token,
                systemProgram: web3_js_1.SystemProgram.programId,
                claimerAta: swapData.payOut ? claimerAta : null,
                claimerUserData: !swapData.payOut ? this.root.SwapUserVault(swapData.claimer, swapData.token) : null
            };
            if (swapData.payIn) {
                const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(swapData.token, swapData.offerer);
                return new SolanaAction_1.SolanaAction(swapData.offerer, this.root, yield this.program.methods
                    .offererInitializePayIn(swapData.toSwapDataStruct(), [...buffer_1.Buffer.alloc(32, 0)], timeout)
                    .accounts(Object.assign(Object.assign({}, accounts), { offererAta: ata, vault: this.root.SwapVault(swapData.token), vaultAuthority: this.root.SwapVaultAuthority, tokenProgram: spl_token_1.TOKEN_PROGRAM_ID }))
                    .instruction(), SwapInit.CUCosts.INIT_PAY_IN);
            }
            else {
                return new SolanaAction_1.SolanaAction(swapData.claimer, this.root, yield this.program.methods
                    .offererInitialize(swapData.toSwapDataStruct(), swapData.securityDeposit, swapData.claimerBounty, [...(swapData.txoHash != null ? buffer_1.Buffer.from(swapData.txoHash, "hex") : buffer_1.Buffer.alloc(32, 0))], new BN(timeout))
                    .accounts(Object.assign(Object.assign({}, accounts), { offererUserData: this.root.SwapUserVault(swapData.offerer, swapData.token) }))
                    .instruction(), SwapInit.CUCosts.INIT);
            }
        });
    }
    /**
     * InitPayIn action which includes SOL to WSOL wrapping if indicated by the fee rate
     *
     * @param swapData
     * @param timeout
     * @param feeRate
     * @constructor
     * @private
     */
    InitPayIn(swapData, timeout, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!swapData.isPayIn())
                throw new Error("Must be payIn==true");
            const action = new SolanaAction_1.SolanaAction(swapData.offerer, this.root);
            if (this.shouldWrapOnInit(swapData, feeRate))
                action.addAction(this.Wrap(swapData, feeRate));
            action.addAction(yield this.Init(swapData, timeout));
            return action;
        });
    }
    /**
     * InitNotPayIn action with additional createAssociatedTokenAccountIdempotentInstruction instruction, such that
     *  a recipient ATA is created if it doesn't exist
     *
     * @param swapData
     * @param timeout
     * @constructor
     * @private
     */
    InitNotPayIn(swapData, timeout) {
        return __awaiter(this, void 0, void 0, function* () {
            if (swapData.isPayIn())
                throw new Error("Must be payIn==false");
            const action = new SolanaAction_1.SolanaAction(swapData.claimer, this.root);
            action.addIx((0, spl_token_1.createAssociatedTokenAccountIdempotentInstruction)(swapData.claimer, swapData.claimerAta, swapData.claimer, swapData.token));
            action.addAction(yield this.Init(swapData, timeout));
            return action;
        });
    }
    Wrap(swapData, feeRate) {
        const data = this.extractAtaDataFromFeeRate(feeRate);
        if (data == null)
            throw new Error("Tried to add wrap instruction, but feeRate malformed: " + feeRate);
        return this.root.Tokens.Wrap(swapData.offerer, swapData.amount.sub(data.balance), data.initAta);
    }
    /**
     * Extracts data about SOL to WSOL wrapping from the fee rate, fee rate is used to convey this information from
     *  the user to the intermediary, such that the intermediary creates valid signature for transaction including
     *  the SOL to WSOL wrapping instructions
     *
     * @param feeRate
     * @private
     */
    extractAtaDataFromFeeRate(feeRate) {
        const hashArr = feeRate == null ? [] : feeRate.split("#");
        if (hashArr.length <= 1)
            return null;
        const arr = hashArr[1].split(";");
        if (arr.length <= 1)
            return null;
        return {
            balance: new BN(arr[1]),
            initAta: arr[0] === "1"
        };
    }
    /**
     * Checks whether a wrap instruction (SOL -> WSOL) should be a part of the signed init message
     *
     * @param swapData
     * @param feeRate
     * @private
     * @returns {boolean} returns true if wrap instruction should be added
     */
    shouldWrapOnInit(swapData, feeRate) {
        const data = this.extractAtaDataFromFeeRate(feeRate);
        if (data == null)
            return false;
        return data.balance.lt(swapData.amount);
    }
    /**
     * Returns the transaction to be signed as an initialization signature from the intermediary, also adds
     *  SOL to WSOL wrapping if indicated by the fee rate
     *
     * @param swapData
     * @param timeout
     * @param feeRate
     * @private
     */
    getTxToSign(swapData, timeout, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            const action = swapData.isPayIn() ?
                yield this.InitPayIn(swapData, new BN(timeout), feeRate) :
                yield this.InitNotPayIn(swapData, new BN(timeout));
            const tx = (yield action.tx(feeRate)).tx;
            return tx;
        });
    }
    /**
     * Returns auth prefix to be used with a specific swap, payIn=true & payIn=false use different prefixes (these
     *  actually have no meaning for the smart contract/solana program in the Solana case)
     *
     * @param swapData
     * @private
     */
    getAuthPrefix(swapData) {
        return swapData.isPayIn() ? "claim_initialize" : "initialize";
    }
    /**
     * Returns "processed" slot required for signature validation, uses preFetchedData if provided & valid
     *
     * @param preFetchedData
     * @private
     */
    getSlotForSignature(preFetchedData) {
        if (preFetchedData != null &&
            preFetchedData.latestSlot != null &&
            preFetchedData.latestSlot.timestamp > Date.now() - this.root.Slots.SLOT_CACHE_TIME) {
            const estimatedSlotsPassed = Math.floor((Date.now() - preFetchedData.latestSlot.timestamp) / this.root.SLOT_TIME);
            const estimatedCurrentSlot = preFetchedData.latestSlot.slot + estimatedSlotsPassed;
            this.logger.debug("getSlotForSignature(): slot: " + preFetchedData.latestSlot.slot +
                " estimated passed slots: " + estimatedSlotsPassed + " estimated current slot: " + estimatedCurrentSlot);
            return Promise.resolve(estimatedCurrentSlot);
        }
        return this.root.Slots.getSlot("processed");
    }
    /**
     * Returns blockhash required for signature validation, uses preFetchedData if provided & valid
     *
     * @param txSlot
     * @param preFetchedData
     * @private
     */
    getBlockhashForSignature(txSlot, preFetchedData) {
        if (preFetchedData != null &&
            preFetchedData.transactionSlot != null &&
            preFetchedData.transactionSlot.slot === txSlot) {
            return Promise.resolve(preFetchedData.transactionSlot.blockhash);
        }
        return this.root.Blocks.getParsedBlock(txSlot).then(val => val.blockhash);
    }
    /**
     * Pre-fetches slot & block based on priorly received SolanaPreFetchData, such that it can later be used
     *  by signature verification
     *
     * @param data
     */
    preFetchForInitSignatureVerification(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const [latestSlot, txBlock] = yield Promise.all([
                this.root.Slots.getSlotAndTimestamp("processed"),
                this.root.Blocks.getParsedBlock(data.slot)
            ]);
            return {
                latestSlot,
                transactionSlot: {
                    slot: data.slot,
                    blockhash: txBlock.blockhash
                }
            };
        });
    }
    /**
     * Pre-fetches block data required for signing the init message by the LP, this can happen in parallel before
     *  signing takes place making the quoting quicker
     */
    preFetchBlockDataForSignatures() {
        return __awaiter(this, void 0, void 0, function* () {
            const latestParsedBlock = yield this.root.Blocks.findLatestParsedBlock("finalized");
            return {
                block: latestParsedBlock.block,
                slot: latestParsedBlock.slot,
                timestamp: Date.now()
            };
        });
    }
    /**
     * Signs swap initialization authorization, using data from preFetchedBlockData if provided & still valid (subject
     *  to SIGNATURE_PREFETCH_DATA_VALIDITY)
     *
     * @param signer
     * @param swapData
     * @param authorizationTimeout
     * @param feeRate
     * @param preFetchedBlockData
     * @public
     */
    signSwapInitialization(signer, swapData, authorizationTimeout, preFetchedBlockData, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (signer.keypair == null)
                throw new Error("Unsupported");
            if (!signer.getPublicKey().equals(swapData.isPayIn() ? swapData.claimer : swapData.offerer))
                throw new Error("Invalid signer, wrong public key!");
            if (preFetchedBlockData != null && Date.now() - preFetchedBlockData.timestamp > this.SIGNATURE_PREFETCH_DATA_VALIDITY)
                preFetchedBlockData = null;
            const { block: latestBlock, slot: latestSlot } = preFetchedBlockData || (yield this.root.Blocks.findLatestParsedBlock("finalized"));
            const authTimeout = Math.floor(Date.now() / 1000) + authorizationTimeout;
            const txToSign = yield this.getTxToSign(swapData, authTimeout.toString(10), feeRate);
            txToSign.feePayer = swapData.isPayIn() ? swapData.offerer : swapData.claimer;
            txToSign.recentBlockhash = latestBlock.blockhash;
            txToSign.sign(signer.keypair);
            this.logger.debug("signSwapInitialization(): Signed tx: ", txToSign);
            const sig = txToSign.signatures.find(e => e.publicKey.equals(signer.getPublicKey()));
            return {
                prefix: this.getAuthPrefix(swapData),
                timeout: authTimeout.toString(10),
                signature: latestSlot + ";" + sig.signature.toString("hex")
            };
        });
    }
    /**
     * Checks whether the provided signature data is valid, using preFetchedData if provided and still valid
     *
     * @param swapData
     * @param timeout
     * @param prefix
     * @param signature
     * @param feeRate
     * @param preFetchedData
     * @public
     */
    isSignatureValid(swapData, timeout, prefix, signature, feeRate, preFetchedData) {
        return __awaiter(this, void 0, void 0, function* () {
            const sender = swapData.isPayIn() ? swapData.offerer : swapData.claimer;
            const signer = swapData.isPayIn() ? swapData.claimer : swapData.offerer;
            if (!swapData.isPayIn() && (yield this.root.isExpired(sender.toString(), swapData))) {
                throw new base_1.SignatureVerificationError("Swap will expire too soon!");
            }
            if (prefix !== this.getAuthPrefix(swapData))
                throw new base_1.SignatureVerificationError("Invalid prefix");
            const currentTimestamp = new BN(Math.floor(Date.now() / 1000));
            const isExpired = new BN(timeout).sub(currentTimestamp).lt(new BN(this.root.authGracePeriod));
            if (isExpired)
                throw new base_1.SignatureVerificationError("Authorization expired!");
            const [transactionSlot, signatureString] = signature.split(";");
            const txSlot = parseInt(transactionSlot);
            const [latestSlot, blockhash] = yield Promise.all([
                this.getSlotForSignature(preFetchedData),
                this.getBlockhashForSignature(txSlot, preFetchedData)
            ]);
            const lastValidTransactionSlot = txSlot + this.root.TX_SLOT_VALIDITY;
            const slotsLeft = lastValidTransactionSlot - latestSlot - this.SIGNATURE_SLOT_BUFFER;
            if (slotsLeft < 0)
                throw new base_1.SignatureVerificationError("Authorization expired!");
            const txToSign = yield this.getTxToSign(swapData, timeout, feeRate);
            txToSign.feePayer = sender;
            txToSign.recentBlockhash = blockhash;
            txToSign.addSignature(signer, buffer_1.Buffer.from(signatureString, "hex"));
            this.logger.debug("isSignatureValid(): Signed tx: ", txToSign);
            const valid = txToSign.verifySignatures(false);
            if (!valid)
                throw new base_1.SignatureVerificationError("Invalid signature!");
            return buffer_1.Buffer.from(blockhash);
        });
    }
    /**
     * Gets expiry of the provided signature data, this is a minimum of slot expiry & swap signature expiry
     *
     * @param timeout
     * @param signature
     * @param preFetchedData
     * @public
     */
    getSignatureExpiry(timeout, signature, preFetchedData) {
        return __awaiter(this, void 0, void 0, function* () {
            const [transactionSlotStr, signatureString] = signature.split(";");
            const txSlot = parseInt(transactionSlotStr);
            const latestSlot = yield this.getSlotForSignature(preFetchedData);
            const lastValidTransactionSlot = txSlot + this.root.TX_SLOT_VALIDITY;
            const slotsLeft = lastValidTransactionSlot - latestSlot - this.SIGNATURE_SLOT_BUFFER;
            const now = Date.now();
            const slotExpiryTime = now + (slotsLeft * this.root.SLOT_TIME);
            const timeoutExpiryTime = (parseInt(timeout) - this.root.authGracePeriod) * 1000;
            const expiry = Math.min(slotExpiryTime, timeoutExpiryTime);
            if (expiry < now)
                return 0;
            return expiry;
        });
    }
    /**
     * Checks whether signature is expired for good (uses "finalized" slot)
     *
     * @param signature
     * @param timeout
     * @public
     */
    isSignatureExpired(signature, timeout) {
        return __awaiter(this, void 0, void 0, function* () {
            const [transactionSlotStr, signatureString] = signature.split(";");
            const txSlot = parseInt(transactionSlotStr);
            const lastValidTransactionSlot = txSlot + this.root.TX_SLOT_VALIDITY;
            const latestSlot = yield this.root.Slots.getSlot("finalized");
            const slotsLeft = lastValidTransactionSlot - latestSlot + this.SIGNATURE_SLOT_BUFFER;
            if (slotsLeft < 0)
                return true;
            if ((parseInt(timeout) + this.root.authGracePeriod) * 1000 < Date.now())
                return true;
            return false;
        });
    }
    /**
     * Creates init transaction (InitPayIn) with a valid signature from an LP, also adds a SOL to WSOL wrapping ix to
     *  the init transaction (if indicated by the fee rate) or adds the wrapping in a separate transaction (if no
     *  indication in the fee rate)
     *
     * @param swapData swap to initialize
     * @param timeout init signature timeout
     * @param prefix init signature prefix
     * @param signature init signature
     * @param skipChecks whether to skip signature validity checks
     * @param feeRate fee rate to use for the transaction
     */
    txsInitPayIn(swapData, timeout, prefix, signature, skipChecks, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!skipChecks) {
                const [_, payStatus] = yield Promise.all([
                    (0, Utils_1.tryWithRetries)(() => this.isSignatureValid(swapData, timeout, prefix, signature, feeRate), this.retryPolicy, (e) => e instanceof base_1.SignatureVerificationError),
                    (0, Utils_1.tryWithRetries)(() => this.root.getClaimHashStatus(swapData.getClaimHash()), this.retryPolicy)
                ]);
                if (payStatus !== base_1.SwapCommitStatus.NOT_COMMITED)
                    throw new base_1.SwapDataVerificationError("Invoice already being paid for or paid");
            }
            const [slotNumber, signatureStr] = signature.split(";");
            const block = yield (0, Utils_1.tryWithRetries)(() => this.root.Blocks.getParsedBlock(parseInt(slotNumber)), this.retryPolicy);
            const txs = [];
            let isWrapping = false;
            const isWrappedInSignedTx = feeRate != null && feeRate.split("#").length > 1;
            if (!isWrappedInSignedTx && swapData.token.equals(this.root.Tokens.WSOL_ADDRESS)) {
                const ataAcc = yield (0, Utils_1.tryWithRetries)(() => this.root.Tokens.getATAOrNull(swapData.offererAta), this.retryPolicy);
                const balance = ataAcc == null ? new BN(0) : new BN(ataAcc.amount.toString());
                if (balance.lt(swapData.amount)) {
                    //Need to wrap more SOL to WSOL
                    yield this.root.Tokens.Wrap(swapData.offerer, swapData.amount.sub(balance), ataAcc == null)
                        .addToTxs(txs, feeRate, block);
                    isWrapping = true;
                }
            }
            const initTx = yield (yield this.InitPayIn(swapData, new BN(timeout), feeRate)).tx(feeRate, block);
            initTx.tx.addSignature(swapData.claimer, buffer_1.Buffer.from(signatureStr, "hex"));
            txs.push(initTx);
            this.logger.debug("txsInitPayIn(): create swap init TX, swap: " + swapData.getClaimHash() +
                " wrapping client-side: " + isWrapping + " feerate: " + feeRate);
            return txs;
        });
    }
    /**
     * Creates init transactions (InitNotPayIn) with a valid signature from an intermediary
     *
     * @param swapData swap to initialize
     * @param timeout init signature timeout
     * @param prefix init signature prefix
     * @param signature init signature
     * @param skipChecks whether to skip signature validity checks
     * @param feeRate fee rate to use for the transaction
     */
    txsInit(swapData, timeout, prefix, signature, skipChecks, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!skipChecks) {
                yield (0, Utils_1.tryWithRetries)(() => this.isSignatureValid(swapData, timeout, prefix, signature, feeRate), this.retryPolicy, (e) => e instanceof base_1.SignatureVerificationError);
            }
            const [slotNumber, signatureStr] = signature.split(";");
            const block = yield (0, Utils_1.tryWithRetries)(() => this.root.Blocks.getParsedBlock(parseInt(slotNumber)), this.retryPolicy);
            const initTx = yield (yield this.InitNotPayIn(swapData, new BN(timeout))).tx(feeRate, block);
            initTx.tx.addSignature(swapData.offerer, buffer_1.Buffer.from(signatureStr, "hex"));
            this.logger.debug("txsInit(): create swap init TX, swap: " + swapData.getClaimHash() + " feerate: " + feeRate);
            return [initTx];
        });
    }
    /**
     * Returns the fee rate to be used for a specific init transaction, also adding indication whether the WSOL ATA
     *  should be initialized in the init transaction and/or current balance in the WSOL ATA
     *
     * @param offerer
     * @param claimer
     * @param token
     * @param paymentHash
     */
    getInitPayInFeeRate(offerer, claimer, token, paymentHash) {
        return __awaiter(this, void 0, void 0, function* () {
            const accounts = [];
            if (offerer != null)
                accounts.push(offerer);
            if (token != null) {
                accounts.push(this.root.SwapVault(token));
                if (offerer != null)
                    accounts.push((0, spl_token_1.getAssociatedTokenAddressSync)(token, offerer));
                if (claimer != null)
                    accounts.push(this.root.SwapUserVault(claimer, token));
            }
            if (paymentHash != null)
                accounts.push(this.root.SwapEscrowState(buffer_1.Buffer.from(paymentHash, "hex")));
            const shouldCheckWSOLAta = token != null && offerer != null && token.equals(this.root.Tokens.WSOL_ADDRESS);
            let [feeRate, _account] = yield Promise.all([
                this.root.Fees.getFeeRate(accounts),
                shouldCheckWSOLAta ?
                    this.root.Tokens.getATAOrNull((0, spl_token_1.getAssociatedTokenAddressSync)(token, offerer)) :
                    Promise.resolve(null)
            ]);
            if (shouldCheckWSOLAta) {
                const account = _account;
                const balance = account == null ? new BN(0) : new BN(account.amount.toString());
                //Add an indication about whether the ATA is initialized & balance it contains
                feeRate += "#" + (account != null ? "0" : "1") + ";" + balance.toString(10);
            }
            this.logger.debug("getInitPayInFeeRate(): feerate computed: " + feeRate);
            return feeRate;
        });
    }
    /**
     * Returns the fee rate to be used for a specific init transaction
     *
     * @param offerer
     * @param claimer
     * @param token
     * @param paymentHash
     */
    getInitFeeRate(offerer, claimer, token, paymentHash) {
        const accounts = [];
        if (offerer != null && token != null)
            accounts.push(this.root.SwapUserVault(offerer, token));
        if (claimer != null)
            accounts.push(claimer);
        if (paymentHash != null)
            accounts.push(this.root.SwapEscrowState(buffer_1.Buffer.from(paymentHash, "hex")));
        return this.root.Fees.getFeeRate(accounts);
    }
    /**
     * Get the estimated solana fee of the init transaction, this includes the required deposit for creating swap PDA
     *  and also deposit for ATAs
     */
    getInitFee(swapData, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (swapData == null)
                return new BN(this.root.ESCROW_STATE_RENT_EXEMPT).add(yield this.getRawInitFee(swapData, feeRate));
            feeRate = feeRate ||
                (swapData.payIn
                    ? yield this.getInitPayInFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash)
                    : yield this.getInitFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash));
            const [rawFee, initAta] = yield Promise.all([
                this.getRawInitFee(swapData, feeRate),
                swapData != null && swapData.payOut ?
                    this.root.Tokens.getATAOrNull((0, spl_token_1.getAssociatedTokenAddressSync)(swapData.token, swapData.claimer)).then(acc => acc == null) :
                    Promise.resolve(null)
            ]);
            let resultingFee = new BN(this.root.ESCROW_STATE_RENT_EXEMPT).add(rawFee);
            if (initAta)
                resultingFee = resultingFee.add(new BN(this.root.Tokens.SPL_ATA_RENT_EXEMPT));
            if (swapData.payIn && this.shouldWrapOnInit(swapData, feeRate) && this.extractAtaDataFromFeeRate(feeRate).initAta) {
                resultingFee = resultingFee.add(new BN(this.root.Tokens.SPL_ATA_RENT_EXEMPT));
            }
            return resultingFee;
        });
    }
    /**
     * Get the estimated solana fee of the init transaction, without the required deposit for creating swap PDA
     */
    getRawInitFee(swapData, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (swapData == null)
                return new BN(10000);
            feeRate = feeRate ||
                (swapData.payIn
                    ? yield this.getInitPayInFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash)
                    : yield this.getInitFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash));
            let computeBudget = swapData.payIn ? SwapInit.CUCosts.INIT_PAY_IN : SwapInit.CUCosts.INIT;
            if (swapData.payIn && this.shouldWrapOnInit(swapData, feeRate)) {
                computeBudget += SolanaTokens_1.SolanaTokens.CUCosts.WRAP_SOL;
                const data = this.extractAtaDataFromFeeRate(feeRate);
                if (data.initAta)
                    computeBudget += SolanaTokens_1.SolanaTokens.CUCosts.ATA_INIT;
            }
            const baseFee = swapData.payIn ? 10000 : 10000 + 5000;
            return new BN(baseFee).add(this.root.Fees.getPriorityFee(computeBudget, feeRate));
        });
    }
}
exports.SwapInit = SwapInit;
SwapInit.CUCosts = {
    INIT: 90000,
    INIT_PAY_IN: 50000,
};
