"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaTokens = void 0;
const SolanaModule_1 = require("../SolanaModule");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const SolanaAction_1 = require("../SolanaAction");
const Utils_1 = require("../../../utils/Utils");
class SolanaTokens extends SolanaModule_1.SolanaModule {
    /**
     * Creates an ATA for a specific public key & token, the ATA creation is paid for by the underlying provider's
     *  public key
     *
     * @param signer
     * @param publicKey public key address of the user for which to initiate the ATA
     * @param token token identification for which the ATA should be initialized
     * @param requiredAta optional required ata address to use, if the address doesn't match it returns null
     * @constructor
     */
    InitAta(signer, publicKey, token, requiredAta) {
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, publicKey, true);
        if (requiredAta != null && !ata.equals(requiredAta))
            return null;
        return new SolanaAction_1.SolanaAction(signer, this.root, (0, spl_token_1.createAssociatedTokenAccountInstruction)(signer, ata, publicKey, token), SolanaTokens.CUCosts.ATA_INIT);
    }
    /**
     * Action for wrapping SOL to WSOL for a specific public key
     *
     * @param publicKey public key of the user for which to wrap the SOL
     * @param amount amount of SOL in lamports (smallest unit) to wrap
     * @param initAta whether we should also initialize the ATA before depositing SOL
     * @constructor
     */
    Wrap(publicKey, amount, initAta) {
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(SolanaTokens.WSOL_ADDRESS, publicKey, true);
        const action = new SolanaAction_1.SolanaAction(publicKey, this.root);
        if (initAta)
            action.addIx((0, spl_token_1.createAssociatedTokenAccountInstruction)(publicKey, ata, publicKey, SolanaTokens.WSOL_ADDRESS), SolanaTokens.CUCosts.ATA_INIT);
        action.addIx(web3_js_1.SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: ata,
            lamports: amount
        }), SolanaTokens.CUCosts.WRAP_SOL);
        action.addIx((0, spl_token_1.createSyncNativeInstruction)(ata));
        return action;
    }
    /**
     * Action for unwrapping WSOL to SOL for a specific public key
     *
     * @param publicKey public key of the user for which to unwrap the sol
     * @constructor
     */
    Unwrap(publicKey) {
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(SolanaTokens.WSOL_ADDRESS, publicKey, true);
        return new SolanaAction_1.SolanaAction(publicKey, this.root, (0, spl_token_1.createCloseAccountInstruction)(ata, publicKey, publicKey), SolanaTokens.CUCosts.ATA_CLOSE);
    }
    /**
     * Action for transferring the native SOL token, uses provider's public key as a sender
     *
     * @param signer
     * @param recipient
     * @param amount
     * @constructor
     * @private
     */
    SolTransfer(signer, recipient, amount) {
        return new SolanaAction_1.SolanaAction(signer, this.root, web3_js_1.SystemProgram.transfer({
            fromPubkey: signer,
            toPubkey: recipient,
            lamports: amount
        }), SolanaTokens.CUCosts.TRANSFER_SOL);
    }
    /**
     * Action for transferring the SPL token, uses provider's public key as a sender
     *
     * @param signer
     * @param recipient
     * @param token
     * @param amount
     * @constructor
     * @private
     */
    Transfer(signer, recipient, token, amount) {
        const srcAta = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer, true);
        const dstAta = (0, spl_token_1.getAssociatedTokenAddressSync)(token, recipient, true);
        return new SolanaAction_1.SolanaAction(signer, this.root, (0, spl_token_1.createTransferInstruction)(srcAta, dstAta, signer, amount), SolanaTokens.CUCosts.TRANSFER);
    }
    /**
     * Creates transactions for sending SOL (the native token)
     *
     * @param signer
     * @param amount amount of the SOL in lamports (smallest unit) to send
     * @param recipient recipient's address
     * @param feeRate fee rate to use for the transactions
     * @private
     */
    async txsTransferSol(signer, amount, recipient, feeRate) {
        const wsolAta = (0, spl_token_1.getAssociatedTokenAddressSync)(SolanaTokens.WSOL_ADDRESS, signer, true);
        const shouldUnwrap = await this.ataExists(wsolAta);
        const action = new SolanaAction_1.SolanaAction(signer, this.root);
        if (shouldUnwrap) {
            feeRate = feeRate || await this.root.Fees.getFeeRate([signer, recipient, wsolAta]);
            action.add(this.Unwrap(signer));
        }
        else {
            feeRate = feeRate || await this.root.Fees.getFeeRate([signer, recipient]);
        }
        action.add(this.SolTransfer(signer, recipient, amount));
        this.logger.debug("txsTransferSol(): transfer native solana TX created, recipient: " + recipient.toString() +
            " amount: " + amount.toString(10) + " unwrapping: " + shouldUnwrap);
        return [await action.tx(feeRate)];
    }
    /**
     * Creates transactions for sending the over the tokens
     *
     * @param signer
     * @param token token to send
     * @param amount amount of the token to send
     * @param recipient recipient's address
     * @param feeRate fee rate to use for the transactions
     * @private
     */
    async txsTransferTokens(signer, token, amount, recipient, feeRate) {
        const srcAta = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer, true);
        const dstAta = (0, spl_token_1.getAssociatedTokenAddressSync)(token, recipient, true);
        feeRate = feeRate || await this.root.Fees.getFeeRate([signer, srcAta, dstAta]);
        const initAta = !await this.ataExists(dstAta);
        const action = new SolanaAction_1.SolanaAction(signer, this.root);
        if (initAta) {
            action.add(this.InitAta(signer, recipient, token));
        }
        action.add(this.Transfer(signer, recipient, token, amount));
        this.logger.debug("txsTransferTokens(): transfer TX created, recipient: " + recipient.toString() +
            " token: " + token.toString() + " amount: " + amount.toString(10) + " initAta: " + initAta);
        return [await action.tx(feeRate)];
    }
    ///////////////////
    //// Tokens
    /**
     * Checks if the provided string is a valid solana token
     *
     * @param token
     */
    isValidToken(token) {
        try {
            new web3_js_1.PublicKey(token);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * Returns the specific ATA or null if it doesn't exist
     *
     * @param ata
     */
    getATAOrNull(ata) {
        return (0, spl_token_1.getAccount)(this.connection, ata).catch(e => {
            if (e instanceof spl_token_1.TokenAccountNotFoundError)
                return null;
            throw e;
        });
    }
    /**
     * Checks whether the specific ATA exists, uses tryWithRetries so retries on failure
     *
     * @param ata
     */
    async ataExists(ata) {
        const account = await (0, Utils_1.tryWithRetries)(() => this.getATAOrNull(ata), this.retryPolicy);
        return account != null;
    }
    /**
     * Returns the rent exempt deposit required to initiate the ATA
     */
    getATARentExemptLamports() {
        return Promise.resolve(BigInt(SolanaTokens.SPL_ATA_RENT_EXEMPT));
    }
    /**
     * Returns the token balance of the public key
     *
     * @param publicKey
     * @param token
     */
    async getTokenBalance(publicKey, token) {
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, publicKey, true);
        const [ataAccount, balance] = await Promise.all([
            this.getATAOrNull(ata),
            (token != null && token.equals(SolanaTokens.WSOL_ADDRESS)) ? this.connection.getBalance(publicKey) : Promise.resolve(null)
        ]);
        let ataExists = ataAccount != null;
        let sum = 0n;
        if (ataExists) {
            sum += ataAccount.amount;
        }
        if (balance != null) {
            let balanceLamports = BigInt(balance);
            if (!ataExists)
                balanceLamports = balanceLamports - await this.getATARentExemptLamports();
            if (balanceLamports >= 0n)
                sum += balanceLamports;
        }
        this.logger.debug("getTokenBalance(): token balance fetched, token: " + token.toString() +
            " address: " + publicKey.toString() + " amount: " + sum.toString());
        return { balance: sum, ataExists };
    }
    /**
     * Returns the native currency address, we use WSOL address as placeholder for SOL
     */
    getNativeCurrencyAddress() {
        return SolanaTokens.WSOL_ADDRESS;
    }
    /**
     * Parses string base58 representation of the token address to a PublicKey object
     * @param address
     */
    toTokenAddress(address) {
        return new web3_js_1.PublicKey(address);
    }
    ///////////////////
    //// Transfers
    /**
     * Create transactions for sending a specific token to a destination address
     *
     * @param signer
     * @param token token to use for the transfer
     * @param amount amount of token in base units to transfer
     * @param dstAddress destination address of the recipient
     * @param feeRate fee rate to use for the transaction
     */
    txsTransfer(signer, token, amount, dstAddress, feeRate) {
        if (SolanaTokens.WSOL_ADDRESS.equals(token)) {
            return this.txsTransferSol(signer, amount, dstAddress, feeRate);
        }
        return this.txsTransferTokens(signer, token, amount, dstAddress, feeRate);
    }
}
exports.SolanaTokens = SolanaTokens;
SolanaTokens.CUCosts = {
    WRAP_SOL: 10000,
    ATA_CLOSE: 10000,
    ATA_INIT: 40000,
    TRANSFER: 50000,
    TRANSFER_SOL: 5000
};
SolanaTokens.WSOL_ADDRESS = new web3_js_1.PublicKey("So11111111111111111111111111111111111111112");
SolanaTokens.SPL_ATA_RENT_EXEMPT = 2039280;
