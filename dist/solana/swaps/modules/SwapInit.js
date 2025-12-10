"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapInit = void 0;
const web3_js_1 = require("@solana/web3.js");
const base_1 = require("@atomiqlabs/base");
const SolanaAction_1 = require("../../chain/SolanaAction");
const spl_token_1 = require("@solana/spl-token");
const SolanaSwapModule_1 = require("../SolanaSwapModule");
const Utils_1 = require("../../../utils/Utils");
const buffer_1 = require("buffer");
const SolanaTokens_1 = require("../../chain/modules/SolanaTokens");
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
    async Init(swapData, timeout) {
        const claimerAta = (0, spl_token_1.getAssociatedTokenAddressSync)(swapData.token, swapData.claimer);
        const paymentHash = buffer_1.Buffer.from(swapData.paymentHash, "hex");
        const accounts = {
            claimer: swapData.claimer,
            offerer: swapData.offerer,
            escrowState: this.program.SwapEscrowState(paymentHash),
            mint: swapData.token,
            systemProgram: web3_js_1.SystemProgram.programId,
            claimerAta: swapData.payOut ? claimerAta : null,
            claimerUserData: !swapData.payOut ? this.program.SwapUserVault(swapData.claimer, swapData.token) : null
        };
        if (swapData.payIn) {
            const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(swapData.token, swapData.offerer);
            return new SolanaAction_1.SolanaAction(swapData.offerer, this.root, await this.swapProgram.methods
                .offererInitializePayIn(swapData.toSwapDataStruct(), [...buffer_1.Buffer.alloc(32, 0)], (0, Utils_1.toBN)(timeout))
                .accounts({
                ...accounts,
                offererAta: ata,
                vault: this.program.SwapVault(swapData.token),
                vaultAuthority: this.program.SwapVaultAuthority,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            })
                .instruction(), SwapInit.CUCosts.INIT_PAY_IN);
        }
        else {
            return new SolanaAction_1.SolanaAction(swapData.claimer, this.root, await this.swapProgram.methods
                .offererInitialize(swapData.toSwapDataStruct(), swapData.securityDeposit, swapData.claimerBounty, [...(swapData.txoHash != null ? buffer_1.Buffer.from(swapData.txoHash, "hex") : buffer_1.Buffer.alloc(32, 0))], (0, Utils_1.toBN)(timeout))
                .accounts({
                ...accounts,
                offererUserData: this.program.SwapUserVault(swapData.offerer, swapData.token),
            })
                .instruction(), SwapInit.CUCosts.INIT);
        }
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
    async InitPayIn(swapData, timeout, feeRate) {
        if (!swapData.isPayIn())
            throw new Error("Must be payIn==true");
        const action = new SolanaAction_1.SolanaAction(swapData.offerer, this.root);
        if (this.shouldWrapOnInit(swapData, feeRate))
            action.addAction(this.Wrap(swapData, feeRate));
        action.addAction(await this.Init(swapData, timeout));
        return action;
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
    async InitNotPayIn(swapData, timeout) {
        if (swapData.isPayIn())
            throw new Error("Must be payIn==false");
        const action = new SolanaAction_1.SolanaAction(swapData.claimer, this.root);
        action.addIx((0, spl_token_1.createAssociatedTokenAccountIdempotentInstruction)(swapData.claimer, swapData.claimerAta ?? await (0, spl_token_1.getAssociatedTokenAddress)(swapData.token, swapData.claimer), swapData.claimer, swapData.token));
        action.addAction(await this.Init(swapData, timeout));
        return action;
    }
    Wrap(swapData, feeRate) {
        const data = this.extractAtaDataFromFeeRate(feeRate);
        if (feeRate == null || data == null)
            throw new Error("Tried to add wrap instruction, but feeRate malformed: " + feeRate);
        return this.root.Tokens.Wrap(swapData.offerer, swapData.getAmount() - data.balance, data.initAta);
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
            balance: BigInt(arr[1]),
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
        return data.balance < swapData.getAmount();
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
    async getTxToSign(swapData, timeout, feeRate) {
        const action = swapData.isPayIn() ?
            await this.InitPayIn(swapData, BigInt(timeout), feeRate) :
            await this.InitNotPayIn(swapData, BigInt(timeout));
        const tx = (await action.tx(feeRate)).tx;
        return tx;
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
    async preFetchForInitSignatureVerification(data) {
        const [latestSlot, txBlock] = await Promise.all([
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
    }
    /**
     * Pre-fetches block data required for signing the init message by the LP, this can happen in parallel before
     *  signing takes place making the quoting quicker
     */
    async preFetchBlockDataForSignatures() {
        const latestParsedBlock = await this.root.Blocks.findLatestParsedBlock("finalized");
        return {
            block: latestParsedBlock.block,
            slot: latestParsedBlock.slot,
            timestamp: Date.now()
        };
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
    async signSwapInitialization(signer, swapData, authorizationTimeout, preFetchedBlockData, feeRate) {
        if (signer.keypair == null)
            throw new Error("Unsupported");
        if (!signer.getPublicKey().equals(swapData.isPayIn() ? swapData.claimer : swapData.offerer))
            throw new Error("Invalid signer, wrong public key!");
        if (preFetchedBlockData != null && Date.now() - preFetchedBlockData.timestamp > this.SIGNATURE_PREFETCH_DATA_VALIDITY)
            preFetchedBlockData = undefined;
        const { block: latestBlock, slot: latestSlot } = preFetchedBlockData || await this.root.Blocks.findLatestParsedBlock("finalized");
        const authTimeout = Math.floor(Date.now() / 1000) + authorizationTimeout;
        const txToSign = await this.getTxToSign(swapData, authTimeout.toString(10), feeRate);
        txToSign.feePayer = swapData.isPayIn() ? swapData.offerer : swapData.claimer;
        txToSign.recentBlockhash = latestBlock.blockhash;
        txToSign.sign(signer.keypair);
        this.logger.debug("signSwapInitialization(): Signed tx: ", txToSign);
        const sig = txToSign.signatures.find(e => e.publicKey.equals(signer.getPublicKey()));
        if (sig == null || sig.signature == null)
            throw new Error(`Unable to extract transaction signature! Signer: ${signer.getAddress()}`);
        return {
            prefix: this.getAuthPrefix(swapData),
            timeout: authTimeout.toString(10),
            signature: latestSlot + ";" + sig.signature.toString("hex")
        };
    }
    /**
     * Checks whether the provided signature data is valid, using preFetchedData if provided and still valid
     *
     * @param sender
     * @param swapData
     * @param timeout
     * @param prefix
     * @param signature
     * @param feeRate
     * @param preFetchedData
     * @public
     */
    async isSignatureValid(sender, swapData, timeout, prefix, signature, feeRate, preFetchedData) {
        if (swapData.isPayIn()) {
            if (!swapData.isOfferer(sender))
                throw new base_1.SignatureVerificationError("Sender needs to be offerer in payIn=true swaps");
        }
        else {
            if (!swapData.isClaimer(sender))
                throw new base_1.SignatureVerificationError("Sender needs to be claimer in payIn=false swaps");
        }
        const signer = swapData.isPayIn() ? swapData.claimer : swapData.offerer;
        if (!swapData.isPayIn() && await this.program.isExpired(sender.toString(), swapData)) {
            throw new base_1.SignatureVerificationError("Swap will expire too soon!");
        }
        if (prefix !== this.getAuthPrefix(swapData))
            throw new base_1.SignatureVerificationError("Invalid prefix");
        const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
        const isExpired = (BigInt(timeout) - currentTimestamp) < BigInt(this.program.authGracePeriod);
        if (isExpired)
            throw new base_1.SignatureVerificationError("Authorization expired!");
        const [transactionSlot, signatureString] = signature.split(";");
        const txSlot = parseInt(transactionSlot);
        const [latestSlot, blockhash] = await Promise.all([
            this.getSlotForSignature(preFetchedData),
            this.getBlockhashForSignature(txSlot, preFetchedData)
        ]);
        const lastValidTransactionSlot = txSlot + this.root.TX_SLOT_VALIDITY;
        const slotsLeft = lastValidTransactionSlot - latestSlot - this.SIGNATURE_SLOT_BUFFER;
        if (slotsLeft < 0)
            throw new base_1.SignatureVerificationError("Authorization expired!");
        const txToSign = await this.getTxToSign(swapData, timeout, feeRate);
        txToSign.feePayer = new web3_js_1.PublicKey(sender);
        txToSign.recentBlockhash = blockhash;
        txToSign.addSignature(signer, buffer_1.Buffer.from(signatureString, "hex"));
        this.logger.debug("isSignatureValid(): Signed tx: ", txToSign);
        const valid = txToSign.verifySignatures(false);
        if (!valid)
            throw new base_1.SignatureVerificationError("Invalid signature!");
        return buffer_1.Buffer.from(blockhash);
    }
    /**
     * Gets expiry of the provided signature data, this is a minimum of slot expiry & swap signature expiry
     *
     * @param timeout
     * @param signature
     * @param preFetchedData
     * @public
     */
    async getSignatureExpiry(timeout, signature, preFetchedData) {
        const [transactionSlotStr, signatureString] = signature.split(";");
        const txSlot = parseInt(transactionSlotStr);
        const latestSlot = await this.getSlotForSignature(preFetchedData);
        const lastValidTransactionSlot = txSlot + this.root.TX_SLOT_VALIDITY;
        const slotsLeft = lastValidTransactionSlot - latestSlot - this.SIGNATURE_SLOT_BUFFER;
        const now = Date.now();
        const slotExpiryTime = now + (slotsLeft * this.root.SLOT_TIME);
        const timeoutExpiryTime = (parseInt(timeout) - this.program.authGracePeriod) * 1000;
        const expiry = Math.min(slotExpiryTime, timeoutExpiryTime);
        if (expiry < now)
            return 0;
        return expiry;
    }
    /**
     * Checks whether signature is expired for good (uses "finalized" slot)
     *
     * @param signature
     * @param timeout
     * @public
     */
    async isSignatureExpired(signature, timeout) {
        const [transactionSlotStr, signatureString] = signature.split(";");
        const txSlot = parseInt(transactionSlotStr);
        const lastValidTransactionSlot = txSlot + this.root.TX_SLOT_VALIDITY;
        const latestSlot = await this.root.Slots.getSlot("finalized");
        const slotsLeft = lastValidTransactionSlot - latestSlot + this.SIGNATURE_SLOT_BUFFER;
        if (slotsLeft < 0)
            return true;
        if ((parseInt(timeout) + this.program.authGracePeriod) * 1000 < Date.now())
            return true;
        return false;
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
    async txsInitPayIn(swapData, timeout, prefix, signature, skipChecks, feeRate) {
        if (swapData.offererAta == undefined)
            throw new base_1.SwapDataVerificationError("No offererAta specified for payIn swap!");
        const offererAta = swapData.offererAta;
        if (!skipChecks) {
            const [_, payStatus] = await Promise.all([
                (0, Utils_1.tryWithRetries)(() => this.isSignatureValid(swapData.getOfferer(), swapData, timeout, prefix, signature, feeRate), this.retryPolicy, (e) => e instanceof base_1.SignatureVerificationError),
                (0, Utils_1.tryWithRetries)(() => this.program.getClaimHashStatus(swapData.getClaimHash()), this.retryPolicy)
            ]);
            if (payStatus !== base_1.SwapCommitStateType.NOT_COMMITED)
                throw new base_1.SwapDataVerificationError("Invoice already being paid for or paid");
        }
        const [slotNumber, signatureStr] = signature.split(";");
        const block = await (0, Utils_1.tryWithRetries)(() => this.root.Blocks.getParsedBlock(parseInt(slotNumber)), this.retryPolicy);
        const txs = [];
        let isWrapping = false;
        const isWrappedInSignedTx = feeRate != null && feeRate.split("#").length > 1;
        if (!isWrappedInSignedTx && swapData.token.equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS)) {
            const ataAcc = await (0, Utils_1.tryWithRetries)(() => this.root.Tokens.getATAOrNull(offererAta), this.retryPolicy);
            const balance = ataAcc?.amount ?? 0n;
            if (balance < swapData.getAmount()) {
                //Need to wrap more SOL to WSOL
                await this.root.Tokens.Wrap(swapData.offerer, swapData.getAmount() - balance, ataAcc == null)
                    .addToTxs(txs, feeRate, block);
                isWrapping = true;
            }
        }
        const initTx = await (await this.InitPayIn(swapData, BigInt(timeout), feeRate)).tx(feeRate, block);
        initTx.tx.addSignature(swapData.claimer, buffer_1.Buffer.from(signatureStr, "hex"));
        txs.push(initTx);
        this.logger.debug("txsInitPayIn(): create swap init TX, swap: " + swapData.getClaimHash() +
            " wrapping client-side: " + isWrapping + " feerate: " + feeRate);
        return txs;
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
    async txsInit(swapData, timeout, prefix, signature, skipChecks, feeRate) {
        if (!skipChecks) {
            await (0, Utils_1.tryWithRetries)(() => this.isSignatureValid(swapData.getClaimer(), swapData, timeout, prefix, signature, feeRate), this.retryPolicy, (e) => e instanceof base_1.SignatureVerificationError);
        }
        const [slotNumber, signatureStr] = signature.split(";");
        const block = await (0, Utils_1.tryWithRetries)(() => this.root.Blocks.getParsedBlock(parseInt(slotNumber)), this.retryPolicy);
        const initTx = await (await this.InitNotPayIn(swapData, BigInt(timeout))).tx(feeRate, block);
        initTx.tx.addSignature(swapData.offerer, buffer_1.Buffer.from(signatureStr, "hex"));
        this.logger.debug("txsInit(): create swap init TX, swap: " + swapData.getClaimHash() + " feerate: " + feeRate);
        return [initTx];
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
    async getInitPayInFeeRate(offerer, claimer, token, paymentHash) {
        const accounts = [];
        if (offerer != null)
            accounts.push(offerer);
        if (token != null) {
            accounts.push(this.program.SwapVault(token));
            if (offerer != null)
                accounts.push((0, spl_token_1.getAssociatedTokenAddressSync)(token, offerer));
            if (claimer != null)
                accounts.push(this.program.SwapUserVault(claimer, token));
        }
        if (paymentHash != null)
            accounts.push(this.program.SwapEscrowState(buffer_1.Buffer.from(paymentHash, "hex")));
        const shouldCheckWSOLAta = token != null && offerer != null && token.equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS);
        let [feeRate, account] = await Promise.all([
            this.root.Fees.getFeeRate(accounts),
            shouldCheckWSOLAta ?
                this.root.Tokens.getATAOrNull((0, spl_token_1.getAssociatedTokenAddressSync)(token, offerer)) :
                Promise.resolve(null)
        ]);
        if (shouldCheckWSOLAta) {
            const balance = account?.amount ?? 0n;
            //Add an indication about whether the ATA is initialized & balance it contains
            feeRate += "#" + (account != null ? "0" : "1") + ";" + balance.toString(10);
        }
        this.logger.debug("getInitPayInFeeRate(): feerate computed: " + feeRate);
        return feeRate;
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
            accounts.push(this.program.SwapUserVault(offerer, token));
        if (claimer != null)
            accounts.push(claimer);
        if (paymentHash != null)
            accounts.push(this.program.SwapEscrowState(buffer_1.Buffer.from(paymentHash, "hex")));
        return this.root.Fees.getFeeRate(accounts);
    }
    /**
     * Get the estimated solana fee of the init transaction, this includes the required deposit for creating swap PDA
     *  and also deposit for ATAs
     */
    async getInitFee(swapData, feeRate) {
        if (swapData == null)
            return BigInt(this.program.ESCROW_STATE_RENT_EXEMPT) + await this.getRawInitFee(swapData, feeRate);
        feeRate = feeRate ||
            (swapData.payIn
                ? await this.getInitPayInFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash)
                : await this.getInitFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash));
        const [rawFee, initAta] = await Promise.all([
            this.getRawInitFee(swapData, feeRate),
            swapData != null && swapData.payOut ?
                this.root.Tokens.getATAOrNull((0, spl_token_1.getAssociatedTokenAddressSync)(swapData.token, swapData.claimer)).then(acc => acc == null) :
                Promise.resolve(null)
        ]);
        let resultingFee = BigInt(this.program.ESCROW_STATE_RENT_EXEMPT) + rawFee;
        if (initAta)
            resultingFee += BigInt(SolanaTokens_1.SolanaTokens.SPL_ATA_RENT_EXEMPT);
        if (swapData.payIn && this.shouldWrapOnInit(swapData, feeRate) && this.extractAtaDataFromFeeRate(feeRate).initAta) {
            resultingFee += BigInt(SolanaTokens_1.SolanaTokens.SPL_ATA_RENT_EXEMPT);
        }
        return resultingFee;
    }
    /**
     * Get the estimated solana fee of the init transaction, without the required deposit for creating swap PDA
     */
    async getRawInitFee(swapData, feeRate) {
        if (swapData == null)
            return 10000n;
        feeRate = feeRate ??
            (swapData.payIn
                ? await this.getInitPayInFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash)
                : await this.getInitFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash));
        let computeBudget = swapData.payIn ? SwapInit.CUCosts.INIT_PAY_IN : SwapInit.CUCosts.INIT;
        if (swapData.payIn && this.shouldWrapOnInit(swapData, feeRate)) {
            computeBudget += SolanaTokens_1.SolanaTokens.CUCosts.WRAP_SOL;
            const data = this.extractAtaDataFromFeeRate(feeRate);
            if (data.initAta)
                computeBudget += SolanaTokens_1.SolanaTokens.CUCosts.ATA_INIT;
        }
        const baseFee = swapData.payIn ? 10000n : 10000n + 5000n;
        return baseFee + this.root.Fees.getPriorityFee(computeBudget, feeRate);
    }
}
exports.SwapInit = SwapInit;
SwapInit.CUCosts = {
    INIT: 90000,
    INIT_PAY_IN: 50000,
};
