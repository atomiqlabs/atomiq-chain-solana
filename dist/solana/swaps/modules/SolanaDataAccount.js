"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaDataAccount = exports.StoredDataAccount = void 0;
const SolanaSwapModule_1 = require("../SolanaSwapModule");
const web3_js_1 = require("@solana/web3.js");
const SolanaAction_1 = require("../../chain/SolanaAction");
const Utils_1 = require("../../../utils/Utils");
const SolanaSigner_1 = require("../../wallet/SolanaSigner");
const utils_1 = require("@noble/hashes/utils");
class StoredDataAccount {
    constructor(accountKeyOrData, owner) {
        if (accountKeyOrData instanceof web3_js_1.PublicKey) {
            this.accountKey = accountKeyOrData;
            this.owner = owner;
        }
        else {
            this.accountKey = new web3_js_1.PublicKey(accountKeyOrData.accountKey);
            this.owner = new web3_js_1.PublicKey(accountKeyOrData.owner);
        }
    }
    serialize() {
        return {
            accountKey: this.accountKey.toBase58(),
            owner: this.owner.toBase58()
        };
    }
}
exports.StoredDataAccount = StoredDataAccount;
class SolanaDataAccount extends SolanaSwapModule_1.SolanaSwapModule {
    /**
     * Action for initialization of the data account
     *
     * @param signer
     * @param accountKey
     * @param dataLength
     * @private
     */
    async InitDataAccount(signer, accountKey, dataLength) {
        const accountSize = 32 + dataLength;
        const lamportsDeposit = await (0, Utils_1.tryWithRetries)(() => this.connection.getMinimumBalanceForRentExemption(accountSize), this.retryPolicy);
        return new SolanaAction_1.SolanaAction(signer, this.root, [
            web3_js_1.SystemProgram.createAccount({
                fromPubkey: signer,
                newAccountPubkey: accountKey.publicKey,
                lamports: lamportsDeposit,
                space: accountSize,
                programId: this.swapProgram.programId
            }),
            await this.swapProgram.methods
                .initData()
                .accounts({
                signer,
                data: accountKey.publicKey
            })
                .instruction(),
        ], SolanaDataAccount.CUCosts.DATA_CREATE, null, [accountKey]);
    }
    /**
     * Action for closing the specific data account
     *
     * @param signer
     * @param publicKey
     */
    async CloseDataAccount(signer, publicKey) {
        return new SolanaAction_1.SolanaAction(signer, this.root, await this.swapProgram.methods
            .closeData()
            .accounts({
            signer,
            data: publicKey
        })
            .instruction(), SolanaDataAccount.CUCosts.DATA_REMOVE, await this.root.Fees.getFeeRate([signer, publicKey]));
    }
    /**
     * Action for writing data to a data account, writes up to sizeLimit starting from the offset position of the
     *  provided writeData buffer
     *
     * @param signer
     * @param accountKey account public key to write to
     * @param writeData buffer holding the write data
     * @param offset data from buffer starting at offset are written
     * @param sizeLimit maximum amount of data to be written to the data account in this action
     * @private
     * @returns {Promise<{bytesWritten: number, action: SolanaAction}>} bytes written to the data account & action
     */
    async WriteData(signer, accountKey, writeData, offset, sizeLimit) {
        const writeLen = Math.min(writeData.length - offset, sizeLimit);
        return {
            bytesWritten: writeLen,
            action: new SolanaAction_1.SolanaAction(signer, this.root, await this.swapProgram.methods
                .writeData(offset, writeData.slice(offset, offset + writeLen))
                .accounts({
                signer,
                data: accountKey.publicKey
            })
                .instruction(), SolanaDataAccount.CUCosts.DATA_WRITE)
        };
    }
    constructor(chainInterface, program, storage) {
        super(chainInterface, program);
        this.SwapTxDataAlt = this.program.keypair((reversedTxId, signer) => [Buffer.from(signer.secretKey), reversedTxId]);
        this.SwapTxDataAltBuffer = this.program.keypair((reversedTxId, secret) => [secret, reversedTxId]);
        this.storage = storage;
    }
    /**
     * Saves data account to the storage, the storage is required such that we are able to close the accounts later
     *  manually in case the claim doesn't happen (expires due to fees, etc.)
     *
     * @param signer
     * @param publicKey
     * @private
     */
    saveDataAccount(signer, publicKey) {
        return this.storage.saveData(publicKey.toBase58(), new StoredDataAccount(publicKey, signer));
    }
    /**
     * Initializes the data account handler, loads the existing data accounts which should be checked and closed
     */
    async init() {
        await this.storage.init();
        const loadedData = await this.storage.loadData(StoredDataAccount);
        this.logger.info("init(): initialized & loaded stored data accounts, count: " + loadedData.length);
    }
    /**
     * Removes data account from the list of accounts that should be checked for reclaiming the locked SOL, this should
     *  be called after a batch of transactions claiming the swap was confirmed
     *
     * @param publicKey
     */
    removeDataAccount(publicKey) {
        return this.storage.removeData(publicKey.toBase58());
    }
    async getDataAccountsInfo(signer) {
        const closePublicKeys = [];
        let totalLocked = 0n;
        for (let key in this.storage.data) {
            const { accountKey, owner } = this.storage.data[key];
            if (!owner.equals(signer))
                continue;
            try {
                const fetchedDataAccount = await this.connection.getAccountInfo(accountKey);
                if (fetchedDataAccount == null) {
                    await this.removeDataAccount(accountKey);
                    continue;
                }
                closePublicKeys.push(accountKey);
                totalLocked += BigInt(fetchedDataAccount.lamports);
            }
            catch (e) { }
        }
        return {
            closePublicKeys,
            count: closePublicKeys.length,
            totalValue: totalLocked
        };
    }
    /**
     * Sweeps all old data accounts, reclaiming the SOL locked in the PDAs
     */
    async sweepDataAccounts(signer) {
        const { closePublicKeys, totalValue } = await this.getDataAccountsInfo(signer.getPublicKey());
        if (closePublicKeys.length === 0) {
            this.logger.debug("sweepDataAccounts(): no old data accounts found, no need to close any!");
            return;
        }
        this.logger.debug("sweepDataAccounts(): closing old data accounts: ", closePublicKeys);
        let txns = [];
        for (let publicKey of closePublicKeys) {
            await (await this.CloseDataAccount(signer.getPublicKey(), publicKey)).addToTxs(txns);
        }
        const result = await this.root.Transactions.sendAndConfirm(signer, txns, true, null, true);
        this.logger.info("sweepDataAccounts(): old data accounts closed: " +
            closePublicKeys.map(pk => pk.toBase58()).join());
        for (let publicKey of closePublicKeys) {
            await this.removeDataAccount(publicKey);
        }
        return {
            txIds: result,
            count: closePublicKeys.length,
            totalValue: totalValue
        };
    }
    /**
     * Adds the transactions writing (and also initializing if it doesn't exist) data to the data account
     *
     * @param signer
     * @param reversedTxId reversed btc tx id is used to derive the data account address
     * @param writeData full data to be written to the data account
     * @param txs solana transactions array, where txns for writing & initializing will be added
     * @param feeRate fee rate to use for the transactions
     */
    async addTxsWriteData(signer, reversedTxId, writeData, txs, feeRate) {
        let txDataKey;
        let fetchedDataAccount = null;
        if (signer instanceof SolanaSigner_1.SolanaSigner && signer.keypair != null) {
            txDataKey = this.SwapTxDataAlt(reversedTxId, signer.keypair);
            fetchedDataAccount = await (0, Utils_1.tryWithRetries)(() => this.connection.getAccountInfo(txDataKey.publicKey), this.retryPolicy);
        }
        else {
            const secret = Buffer.from((0, utils_1.randomBytes)(32));
            txDataKey = this.SwapTxDataAltBuffer(reversedTxId, secret);
        }
        const signerKey = signer instanceof SolanaSigner_1.SolanaSigner ? signer.getPublicKey() : signer;
        let pointer = 0;
        if (fetchedDataAccount == null) {
            const action = new SolanaAction_1.SolanaAction(signerKey, this.root);
            action.add(await this.InitDataAccount(signerKey, txDataKey, writeData.length));
            const { bytesWritten, action: writeAction } = await this.WriteData(signerKey, txDataKey, writeData, pointer, 420);
            this.logger.debug("addTxsWriteData(): Write partial data (" + pointer + " .. " + (pointer + bytesWritten) + ")/" + writeData.length +
                " key: " + txDataKey.publicKey.toBase58());
            pointer += bytesWritten;
            action.add(writeAction);
            await action.addToTxs(txs, feeRate);
            await this.saveDataAccount(signerKey, txDataKey.publicKey);
        }
        while (pointer < writeData.length) {
            const { bytesWritten, action } = await this.WriteData(signerKey, txDataKey, writeData, pointer, 950);
            this.logger.debug("addTxsWriteData(): Write partial data (" + pointer + " .. " + (pointer + bytesWritten) + ")/" + writeData.length +
                " key: " + txDataKey.publicKey.toBase58());
            pointer += bytesWritten;
            await action.addToTxs(txs, feeRate);
        }
        return txDataKey.publicKey;
    }
}
exports.SolanaDataAccount = SolanaDataAccount;
SolanaDataAccount.CUCosts = {
    DATA_REMOVE: 50000,
    DATA_CREATE_AND_WRITE: 15000,
    DATA_CREATE: 5000,
    DATA_WRITE: 15000
};
