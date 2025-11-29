"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaTransactions = void 0;
const web3_js_1 = require("@solana/web3.js");
const SolanaModule_1 = require("../SolanaModule");
// @ts-ignore
const bs58 = require("bs58");
const Utils_1 = require("../../../utils/Utils");
const buffer_1 = require("buffer");
const base_1 = require("@atomiqlabs/base");
class SolanaTransactions extends SolanaModule_1.SolanaModule {
    /**
     * Sends raw solana transaction, first through the cbkSendTransaction callback (for e.g. sending the transaction
     *  to a different specific RPC), the through the Fees handler (for e.g. Jito transaction) and last through the
     *  underlying provider's Connection instance (the usual way). Only sends the transaction through one channel.
     *
     * @param data
     * @param options
     * @private
     */
    async sendRawTransaction(data, options) {
        let result = null;
        options ?? (options = {});
        options.maxRetries = 0;
        if (this.cbkSendTransaction != null)
            result = await this.cbkSendTransaction(data, options);
        if (result == null)
            result = await this.root.Fees.submitTx(data, options);
        if (result == null)
            result = await this.connection.sendRawTransaction(data, options);
        // this.logger.debug("sendRawTransaction(): tx sent, signature: "+result);
        return result;
    }
    /**
     * Waits for the transaction to confirm by periodically checking the transaction status over HTTP, also
     *  re-sends the transaction at regular intervals
     *
     * @param solanaTx solana tx to wait for confirmation for
     * @param finality wait for this finality
     * @param abortSignal signal to abort waiting for tx confirmation
     * @private
     */
    txConfirmationAndResendWatchdog(solanaTx, finality, abortSignal) {
        if (solanaTx.tx.signature == null)
            throw new Error("Cannot check confirmation status of tx without signature!");
        const rawTx = solanaTx.tx.serialize();
        const signature = bs58.encode(solanaTx.tx.signature);
        return new Promise((resolve, reject) => {
            let watchdogInterval;
            watchdogInterval = setInterval(async () => {
                const result = await this.sendRawTransaction(rawTx, { skipPreflight: true }).catch(e => this.logger.error("txConfirmationAndResendWatchdog(): transaction re-sent error: ", e));
                this.logger.debug("txConfirmationAndResendWatchdog(): transaction re-sent: " + result);
                const status = await this.getTxIdStatus(signature, finality).catch(e => this.logger.error("txConfirmationAndResendWatchdog(): get tx id status error: ", e));
                if (status == null || status === "not_found") {
                    if (await this.connection.isBlockhashValid(solanaTx.tx.recentBlockhash, { commitment: finality }))
                        return;
                    try {
                        //One list try to get the txId status
                        const statusCheck = await this.getTxIdStatus(signature, finality);
                        if (statusCheck == "not_found")
                            reject(new Error("Transaction expired before confirmation, please try again!"));
                    }
                    catch (e) {
                        this.logger.error("txConfirmationAndResendWatchdog(): re-check get tx id status error: ", e);
                    }
                }
                if (status === "success") {
                    this.logger.info("txConfirmationAndResendWatchdog(): transaction confirmed from HTTP polling, signature: " + signature);
                    resolve(signature);
                }
                if (status === "reverted")
                    reject(new base_1.TransactionRevertedError("Transaction reverted!"));
                clearInterval(watchdogInterval);
            }, this.retryPolicy?.transactionResendInterval || 3000);
            if (abortSignal != null)
                abortSignal.addEventListener("abort", () => {
                    clearInterval(watchdogInterval);
                    reject(abortSignal.reason);
                });
        });
    }
    /**
     * Waits for the transaction to confirm from WS, sometimes the WS rejects even though the transaction was confirmed
     *  this therefore also runs an ultimate check on the transaction in case the WS handler rejects, checking if it
     *  really was expired
     *
     * @param solanaTx solana tx to wait for confirmation for
     * @param finality wait for this finality
     * @param abortSignal signal to abort waiting for tx confirmation
     * @private
     */
    async txConfirmFromWebsocket(solanaTx, finality, abortSignal) {
        if (solanaTx.tx.signature == null)
            throw new Error("Cannot wait for confirmation for tx without signature!");
        if (solanaTx.tx.recentBlockhash == null)
            throw new Error("Cannot wait for confirmation for tx without recentBlockhash!");
        if (solanaTx.tx.lastValidBlockHeight == null)
            throw new Error("Cannot wait for confirmation for tx without lastValidBlockHeight!");
        const signature = bs58.encode(solanaTx.tx.signature);
        let result;
        try {
            result = await this.connection.confirmTransaction(solanaTx.tx.lastValidBlockHeight == null
                ? signature
                : {
                    signature: signature,
                    blockhash: solanaTx.tx.recentBlockhash,
                    lastValidBlockHeight: solanaTx.tx.lastValidBlockHeight,
                    abortSignal
                }, finality);
            this.logger.info("txConfirmFromWebsocket(): transaction confirmed from WS, signature: " + signature);
        }
        catch (err) {
            if (abortSignal != null && abortSignal.aborted)
                throw err;
            this.logger.debug("txConfirmFromWebsocket(): transaction rejected from WS, running ultimate check, expiry blockheight: " + solanaTx.tx.lastValidBlockHeight + " signature: " + signature + " error: " + err);
            const status = await (0, Utils_1.tryWithRetries)(() => this.getTxIdStatus(signature, finality));
            this.logger.info("txConfirmFromWebsocket(): transaction status: " + status + " signature: " + signature);
            if (status === "success")
                return signature;
            if (status === "reverted")
                throw new base_1.TransactionRevertedError("Transaction reverted!");
            if (err instanceof web3_js_1.TransactionExpiredBlockheightExceededError || err.toString().startsWith("TransactionExpiredBlockheightExceededError")) {
                throw new Error("Transaction expired before confirmation, please try again!");
            }
            else {
                throw err;
            }
        }
        if (result.value.err != null)
            throw new base_1.TransactionRevertedError("Transaction reverted!");
        return signature;
    }
    /**
     * Waits for transaction confirmation using WS subscription and occasional HTTP polling, also re-sends
     *  the transaction at regular interval
     *
     * @param solanaTx solana transaction to wait for confirmation for & keep re-sending until it confirms
     * @param abortSignal signal to abort waiting for tx confirmation
     * @param finality wait for specific finality
     * @private
     */
    async confirmTransaction(solanaTx, abortSignal, finality) {
        const abortController = new AbortController();
        if (abortSignal != null)
            abortSignal.addEventListener("abort", () => {
                abortController.abort();
            });
        let txSignature;
        try {
            txSignature = await Promise.race([
                this.txConfirmationAndResendWatchdog(solanaTx, finality, abortController.signal),
                this.txConfirmFromWebsocket(solanaTx, finality, abortController.signal)
            ]);
        }
        catch (e) {
            abortController.abort(e);
            throw e;
        }
        // this.logger.info("confirmTransaction(): transaction confirmed, signature: "+txSignature);
        abortController.abort();
    }
    /**
     * Prepares solana transactions, assigns recentBlockhash if needed, applies Phantom hotfix,
     *  sets feePayer to ourselves, calls beforeTxSigned callback & signs transaction with provided signers array
     *
     * @param signer
     * @param txs
     * @private
     */
    async prepareTransactions(signer, txs) {
        let latestBlockData = null;
        for (let tx of txs) {
            if (tx.tx.recentBlockhash == null) {
                if (latestBlockData == null) {
                    latestBlockData = await (0, Utils_1.tryWithRetries)(() => this.connection.getLatestBlockhash("confirmed"), this.retryPolicy);
                    this.logger.debug("prepareTransactions(): fetched latest block data for transactions," +
                        " blockhash: " + latestBlockData.blockhash + " expiry blockheight: " + latestBlockData.lastValidBlockHeight);
                }
                tx.tx.recentBlockhash = latestBlockData.blockhash;
                tx.tx.lastValidBlockHeight = latestBlockData.lastValidBlockHeight;
            }
            //This is a hotfix for Phantom adding compute unit price instruction on the first position & breaking
            // required instructions order (e.g. btc relay verify needs to be 0th instruction in a tx)
            if (signer.keypair == null && tx.tx.signatures.length === 0) {
                const foundIx = tx.tx.instructions.find(ix => ix.programId.equals(web3_js_1.ComputeBudgetProgram.programId) && web3_js_1.ComputeBudgetInstruction.decodeInstructionType(ix) === "SetComputeUnitPrice");
                if (foundIx == null)
                    tx.tx.instructions.splice(tx.tx.instructions.length - 1, 0, web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }));
            }
            tx.tx.feePayer = signer.getPublicKey();
            if (this.cbkBeforeTxSigned != null)
                await this.cbkBeforeTxSigned(tx);
            if (tx.signers != null && tx.signers.length > 0)
                for (let signer of tx.signers)
                    tx.tx.sign(signer);
        }
    }
    /**
     * Sends out a signed transaction to the RPC
     *
     * @param solTx solana tx to send
     * @param options send options to be passed to the RPC
     * @param onBeforePublish a callback called before every transaction is published
     * @private
     */
    async sendSignedTransaction(solTx, options, onBeforePublish) {
        if (solTx.tx.signature == null)
            throw new Error("Cannot broadcast tx without signature!");
        const signature = bs58.encode(solTx.tx.signature);
        if (onBeforePublish != null)
            await onBeforePublish(signature, this.serializeSignedTx(solTx.tx));
        const serializedTx = solTx.tx.serialize();
        this.logger.debug("sendSignedTransaction(): sending transaction: " + serializedTx.toString("hex") +
            " signature: " + signature);
        const txResult = await (0, Utils_1.tryWithRetries)(() => this.sendRawTransaction(serializedTx, options), this.retryPolicy);
        this.logger.info("sendSignedTransaction(): tx sent, signature: " + txResult);
        return txResult;
    }
    /**
     * Prepares (adds recent blockhash if required, applies Phantom hotfix),
     *  signs (all together using signAllTransactions() calls), sends (in parallel or sequentially) &
     *  optionally waits for confirmation of a batch of solana transactions
     *
     * @param signer
     * @param _txs
     * @param waitForConfirmation whether to wait for transaction confirmations (this also makes sure the transactions
     *  are re-sent at regular intervals)
     * @param abortSignal abort signal to abort waiting for transaction confirmations
     * @param parallel whether the send all the transaction at once in parallel or sequentially (such that transactions
     *  are executed in order)
     * @param onBeforePublish a callback called before every transaction is published
     */
    async sendAndConfirm(signer, _txs, waitForConfirmation, abortSignal, parallel, onBeforePublish) {
        const options = {
            skipPreflight: true
        };
        this.logger.debug("sendAndConfirm(): sending transactions, count: " + _txs.length +
            " waitForConfirmation: " + waitForConfirmation + " parallel: " + parallel);
        const BATCH_SIZE = 50;
        const signatures = [];
        for (let e = 0; e < _txs.length; e += BATCH_SIZE) {
            const txs = _txs.slice(e, e + BATCH_SIZE);
            await this.prepareTransactions(signer, txs);
            const signedTxs = await signer.wallet.signAllTransactions(txs.map(e => e.tx));
            signedTxs.forEach((tx, index) => {
                const solTx = txs[index];
                tx.lastValidBlockHeight = solTx.tx.lastValidBlockHeight;
                solTx.tx = tx;
            });
            this.logger.debug("sendAndConfirm(): sending transaction batch (" + e + ".." + (e + 50) + "), count: " + txs.length);
            //For solana we are forced to send txs one-by-one even with parallel, as we cannot determine their order upfront,
            // however e.g. Jito could possibly handle sending a single package of up to 5 txns in order.
            for (let i = 0; i < txs.length; i++) {
                const solTx = txs[i];
                const signature = await this.sendSignedTransaction(solTx, options, onBeforePublish);
                const confirmPromise = this.confirmTransaction(solTx, abortSignal, "confirmed");
                //Don't await the last promise when !waitForConfirmation
                if (i < txs.length - 1 || e + 50 < _txs.length || waitForConfirmation)
                    await confirmPromise;
                signatures.push(signature);
            }
        }
        this.logger.info("sendAndConfirm(): sent transactions, count: " + _txs.length +
            " waitForConfirmation: " + waitForConfirmation + " parallel: " + parallel);
        return signatures;
    }
    async sendSignedAndConfirm(signedTxs, waitForConfirmation, abortSignal, parallel, onBeforePublish) {
        //Verify all txns are properly signed
        signedTxs.forEach(val => {
            const pubkeysSigned = new Set(val.signatures.map(val => val.publicKey.toString()));
            val.instructions.forEach(ix => {
                ix.keys.forEach(key => {
                    if (key.isSigner && !pubkeysSigned.has(key.pubkey.toString()))
                        throw new Error("Transaction requires signature by: " + key.pubkey.toString());
                });
            });
        });
        const options = {
            skipPreflight: true
        };
        this.logger.debug("sendSignedAndConfirm(): sending transactions, count: " + signedTxs.length +
            " waitForConfirmation: " + waitForConfirmation + " parallel: " + parallel);
        const signatures = [];
        const promises = [];
        for (let i = 0; i < signedTxs.length; i++) {
            const signedTx = {
                tx: signedTxs[i],
                signers: []
            };
            this.logger.debug("sendSignedAndConfirm(): sending transaction " + i + ", total count: " + signedTxs.length);
            const signature = await this.sendSignedTransaction(signedTx, options, onBeforePublish);
            const confirmPromise = this.confirmTransaction(signedTx, abortSignal, "confirmed");
            if (!parallel) {
                //Don't await the last one when not wait for confirmations
                if (i < signedTxs.length - 1 || waitForConfirmation)
                    await confirmPromise;
            }
            else {
                promises.push(confirmPromise);
            }
            signatures.push(signature);
        }
        if (parallel && waitForConfirmation)
            await Promise.all(promises);
        this.logger.info("sendSignedAndConfirm(): sent transactions, count: " + signedTxs.length +
            " waitForConfirmation: " + waitForConfirmation + " parallel: " + parallel);
        return signatures;
    }
    /**
     * Serializes the solana transaction, saves the transaction, signers & last valid blockheight
     *
     * @param tx
     */
    serializeUnsignedTx(tx) {
        return JSON.stringify({
            tx: tx.tx.serialize().toString("hex"),
            signers: tx.signers.map(e => buffer_1.Buffer.from(e.secretKey).toString("hex")),
            lastValidBlockheight: tx.tx.lastValidBlockHeight
        });
    }
    /**
     * Serializes the solana transaction
     *
     * @param signedTx
     */
    serializeSignedTx(signedTx) {
        return signedTx.serialize().toString("hex");
    }
    /**
     * Deserializes saved solana transaction, extracting the transaction, signers & last valid blockheight
     *
     * @param txData
     */
    deserializeUnsignedTx(txData) {
        const jsonParsed = JSON.parse(txData);
        const transaction = web3_js_1.Transaction.from(buffer_1.Buffer.from(jsonParsed.tx, "hex"));
        transaction.lastValidBlockHeight = jsonParsed.lastValidBlockheight;
        return {
            tx: transaction,
            signers: jsonParsed.signers.map(e => web3_js_1.Keypair.fromSecretKey(buffer_1.Buffer.from(e, "hex"))),
        };
    }
    /**
     * Deserializes raw solana transaction
     *
     * @param txData
     */
    deserializeSignedTransaction(txData) {
        return web3_js_1.Transaction.from(buffer_1.Buffer.from(txData, "hex"));
    }
    /**
     * Gets the status of the raw solana transaction, this also checks transaction expiry & can therefore report tx
     *  in "pending" status, however pending status doesn't necessarily mean that the transaction was sent (again,
     *  no mempool on Solana, cannot check that), this function is preferred against getTxIdStatus
     *
     * @param tx
     */
    async getTxStatus(tx) {
        const parsedTx = this.deserializeSignedTransaction(tx);
        const signature = bs58.encode(parsedTx.signature);
        const txReceipt = await this.connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0
        });
        if (txReceipt == null) {
            const isValid = await this.connection.isBlockhashValid(parsedTx.recentBlockhash, { commitment: "processed" });
            if (!isValid)
                return "not_found";
            return "pending";
        }
        if (txReceipt.meta == null)
            throw new Error(`Cannot read status (meta) of Solana transaction: ${signature}`);
        if (txReceipt.meta.err)
            return "reverted";
        return "success";
    }
    /**
     * Gets the status of the solana transaction with a specific txId, this cannot report whether the transaction is
     *  "pending" because Solana has no concept of mempool & only confirmed transactions are accessible
     *
     * @param txId
     * @param finality
     */
    async getTxIdStatus(txId, finality) {
        const txReceipt = await this.connection.getTransaction(txId, {
            commitment: finality || "confirmed",
            maxSupportedTransactionVersion: 0
        });
        if (txReceipt == null)
            return "not_found";
        if (txReceipt.meta == null)
            throw new Error(`Cannot read status (meta) of Solana transaction: ${txId}`);
        if (txReceipt.meta.err)
            return "reverted";
        return "success";
    }
    onBeforeTxSigned(callback) {
        this.cbkBeforeTxSigned = callback;
    }
    offBeforeTxSigned(callback) {
        delete this.cbkBeforeTxSigned;
        return true;
    }
    onSendTransaction(callback) {
        this.cbkSendTransaction = callback;
    }
    offSendTransaction(callback) {
        delete this.cbkSendTransaction;
        return true;
    }
}
exports.SolanaTransactions = SolanaTransactions;
