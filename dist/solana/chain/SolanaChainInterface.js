"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaChainInterface = void 0;
const web3_js_1 = require("@solana/web3.js");
const SolanaFees_1 = require("./modules/SolanaFees");
const SolanaBlocks_1 = require("./modules/SolanaBlocks");
const SolanaSlots_1 = require("./modules/SolanaSlots");
const SolanaTokens_1 = require("./modules/SolanaTokens");
const SolanaTransactions_1 = require("./modules/SolanaTransactions");
const SolanaSignatures_1 = require("./modules/SolanaSignatures");
const SolanaEvents_1 = require("./modules/SolanaEvents");
const Utils_1 = require("../../utils/Utils");
const SolanaAddresses_1 = require("./modules/SolanaAddresses");
const SolanaSigner_1 = require("../wallet/SolanaSigner");
const SolanaKeypairWallet_1 = require("../wallet/SolanaKeypairWallet");
/**
 * Main chain interface for interacting with Solana blockchain
 * @category Chain Interface
 */
class SolanaChainInterface {
    constructor(connection, retryPolicy, solanaFeeEstimator = new SolanaFees_1.SolanaFees(connection)) {
        this.chainId = "SOLANA";
        this.SLOT_TIME = 400;
        this.TX_SLOT_VALIDITY = 151;
        this.logger = (0, Utils_1.getLogger)(this.constructor.name + ": ");
        this.connection = connection;
        this.retryPolicy = retryPolicy;
        this.Blocks = new SolanaBlocks_1.SolanaBlocks(this);
        this.Fees = solanaFeeEstimator;
        this.Slots = new SolanaSlots_1.SolanaSlots(this);
        this.Tokens = new SolanaTokens_1.SolanaTokens(this);
        this.Transactions = new SolanaTransactions_1.SolanaTransactions(this);
        this.Signatures = new SolanaSignatures_1.SolanaSignatures(this);
        this.Events = new SolanaEvents_1.SolanaEvents(this);
    }
    /**
     * @inheritDoc
     */
    async getBalance(signer, tokenAddress) {
        const token = new web3_js_1.PublicKey(tokenAddress);
        const publicKey = new web3_js_1.PublicKey(signer);
        let { balance } = await this.Tokens.getTokenBalance(publicKey, token);
        if (token.equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS)) {
            const accountRentExemptCost = 1000000n;
            balance = balance - accountRentExemptCost;
            if (balance < 0n)
                balance = 0n;
        }
        this.logger.debug("getBalance(): token balance, token: " + token.toBase58() + " balance: " + balance.toString(10));
        return balance;
    }
    /**
     * @inheritDoc
     */
    isValidAddress(address) {
        return SolanaAddresses_1.SolanaAddresses.isValidAddress(address);
    }
    /**
     * @inheritDoc
     */
    normalizeAddress(address) {
        return address;
    }
    /**
     * @inheritDoc
     */
    getNativeCurrencyAddress() {
        return this.Tokens.getNativeCurrencyAddress().toString();
    }
    /**
     * @inheritDoc
     */
    txsTransfer(signer, token, amount, dstAddress, feeRate) {
        return this.Tokens.txsTransfer(new web3_js_1.PublicKey(signer), new web3_js_1.PublicKey(token), amount, new web3_js_1.PublicKey(dstAddress), feeRate);
    }
    /**
     * @inheritDoc
     */
    async transfer(signer, token, amount, dstAddress, txOptions) {
        const txs = await this.Tokens.txsTransfer(signer.getPublicKey(), new web3_js_1.PublicKey(token), amount, new web3_js_1.PublicKey(dstAddress), txOptions?.feeRate);
        const [txId] = await this.Transactions.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }
    ////////////////////////////////////////////
    //// Transactions
    /**
     * @inheritDoc
     */
    sendAndConfirm(signer, txs, waitForConfirmation, abortSignal, parallel, onBeforePublish) {
        return this.Transactions.sendAndConfirm(signer, txs, waitForConfirmation, abortSignal, parallel, onBeforePublish);
    }
    /**
     * @inheritDoc
     */
    sendSignedAndConfirm(txs, waitForConfirmation, abortSignal, parallel, onBeforePublish) {
        return this.Transactions.sendSignedAndConfirm(txs, waitForConfirmation, abortSignal, parallel, onBeforePublish);
    }
    /**
     * @inheritDoc
     */
    serializeTx(tx) {
        return Promise.resolve(this.Transactions.serializeUnsignedTx(tx));
    }
    /**
     * @inheritDoc
     */
    deserializeTx(txData) {
        return Promise.resolve(this.Transactions.deserializeUnsignedTx(txData));
    }
    /**
     * @inheritDoc
     */
    serializeSignedTx(tx) {
        return Promise.resolve(this.Transactions.serializeSignedTx(tx));
    }
    /**
     * @inheritDoc
     */
    deserializeSignedTx(txData) {
        return Promise.resolve(this.Transactions.deserializeSignedTransaction(txData));
    }
    /**
     * @inheritDoc
     */
    getTxIdStatus(txId) {
        return this.Transactions.getTxIdStatus(txId);
    }
    /**
     * @inheritDoc
     */
    getTxStatus(tx) {
        return this.Transactions.getTxStatus(tx);
    }
    /**
     * @inheritDoc
     */
    async getFinalizedBlock() {
        const { block } = await this.Blocks.findLatestParsedBlock("finalized");
        return {
            height: block.blockHeight,
            blockHash: block.blockhash
        };
    }
    ///////////////////////////////////
    //// Callbacks & handlers
    /**
     * @inheritDoc
     */
    offBeforeTxReplace(callback) {
        return true;
    }
    /**
     * @inheritDoc
     */
    onBeforeTxReplace(callback) { }
    /**
     * @inheritDoc
     */
    onBeforeTxSigned(callback) {
        this.Transactions.onBeforeTxSigned(callback);
    }
    /**
     * @inheritDoc
     */
    offBeforeTxSigned(callback) {
        return this.Transactions.offBeforeTxSigned(callback);
    }
    onSendTransaction(callback) {
        this.Transactions.onSendTransaction(callback);
    }
    offSendTransaction(callback) {
        return this.Transactions.offSendTransaction(callback);
    }
    /**
     * @inheritDoc
     */
    isValidToken(tokenIdentifier) {
        try {
            new web3_js_1.PublicKey(tokenIdentifier);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * @inheritDoc
     */
    randomAddress() {
        return web3_js_1.Keypair.generate().publicKey.toString();
    }
    /**
     * @inheritDoc
     */
    randomSigner() {
        const keypair = web3_js_1.Keypair.generate();
        const wallet = new SolanaKeypairWallet_1.SolanaKeypairWallet(keypair);
        return new SolanaSigner_1.SolanaSigner(wallet, keypair);
    }
    /**
     * @inheritDoc
     */
    wrapSigner(signer) {
        return Promise.resolve(new SolanaSigner_1.SolanaSigner(signer));
    }
}
exports.SolanaChainInterface = SolanaChainInterface;
