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
exports.SolanaLpVault = void 0;
const SolanaSwapModule_1 = require("../SolanaSwapModule");
const SolanaAction_1 = require("../../base/SolanaAction");
const BN = require("bn.js");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const Utils_1 = require("../../../utils/Utils");
const SolanaTokens_1 = require("../../base/modules/SolanaTokens");
class SolanaLpVault extends SolanaSwapModule_1.SolanaSwapModule {
    /**
     * Action for withdrawing funds from the LP vault
     *
     * @param signer
     * @param token
     * @param amount
     * @constructor
     * @private
     */
    Withdraw(signer, token, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer);
            return new SolanaAction_1.SolanaAction(signer, this.root, yield this.program.methods
                .withdraw(new BN(amount))
                .accounts({
                signer,
                signerAta: ata,
                userData: this.root.SwapUserVault(signer, token),
                vault: this.root.SwapVault(token),
                vaultAuthority: this.root.SwapVaultAuthority,
                mint: token,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID
            })
                .instruction(), SolanaLpVault.CUCosts.WITHDRAW);
        });
    }
    /**
     * Action for depositing funds to the LP vault
     *
     * @param signer
     * @param token
     * @param amount
     * @constructor
     * @private
     */
    Deposit(signer, token, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer);
            return new SolanaAction_1.SolanaAction(signer, this.root, yield this.program.methods
                .deposit(new BN(amount))
                .accounts({
                signer,
                signerAta: ata,
                userData: this.root.SwapUserVault(signer, token),
                vault: this.root.SwapVault(token),
                vaultAuthority: this.root.SwapVaultAuthority,
                mint: token,
                systemProgram: web3_js_1.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID
            })
                .instruction(), SolanaLpVault.CUCosts.DEPOSIT);
        });
    }
    /**
     * Returns intermediary's reputation & vault balance for a specific token
     *
     * @param address
     * @param token
     */
    getIntermediaryData(address, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.program.account.userAccount.fetchNullable(this.root.SwapUserVault(address, token));
            if (data == null)
                return null;
            const response = [];
            for (let i = 0; i < data.successVolume.length; i++) {
                response[i] = {
                    successVolume: data.successVolume[i],
                    successCount: data.successCount[i],
                    failVolume: data.failVolume[i],
                    failCount: data.failCount[i],
                    coopCloseVolume: data.coopCloseVolume[i],
                    coopCloseCount: data.coopCloseCount[i]
                };
            }
            return {
                balance: data.amount,
                reputation: response
            };
        });
    }
    /**
     * Returns intermediary's reputation for a specific token
     *
     * @param address
     * @param token
     */
    getIntermediaryReputation(address, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const intermediaryData = yield this.getIntermediaryData(address, token);
            return intermediaryData === null || intermediaryData === void 0 ? void 0 : intermediaryData.reputation;
        });
    }
    /**
     * Returns the balance of the token an intermediary has in his LP vault
     *
     * @param address
     * @param token
     */
    getIntermediaryBalance(address, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const intermediaryData = yield this.getIntermediaryData(address, token);
            const balance = intermediaryData === null || intermediaryData === void 0 ? void 0 : intermediaryData.balance;
            this.logger.debug("getIntermediaryBalance(): token LP balance fetched, token: " + token.toString() +
                " address: " + address + " amount: " + (balance == null ? "null" : balance.toString()));
            return intermediaryData === null || intermediaryData === void 0 ? void 0 : intermediaryData.balance;
        });
    }
    /**
     * Creates transactions for withdrawing funds from the LP vault, creates ATA if it doesn't exist and unwraps
     *  WSOL to SOL if required
     *
     * @param signer
     * @param token
     * @param amount
     * @param feeRate
     */
    txsWithdraw(signer, token, amount, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            const ata = yield (0, spl_token_1.getAssociatedTokenAddress)(token, signer);
            feeRate = feeRate || (yield this.getFeeRate(signer, token));
            const action = new SolanaAction_1.SolanaAction(signer, this.root);
            if (!(yield this.root.Tokens.ataExists(ata))) {
                action.add(this.root.Tokens.InitAta(signer, signer, token));
            }
            action.add(yield this.Withdraw(signer, token, amount));
            const shouldUnwrap = token.equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS);
            if (shouldUnwrap)
                action.add(this.root.Tokens.Unwrap(signer));
            this.logger.debug("txsWithdraw(): withdraw TX created, token: " + token.toString() +
                " amount: " + amount.toString(10) + " unwrapping: " + shouldUnwrap);
            return [yield action.tx(feeRate)];
        });
    }
    /**
     * Creates transaction for depositing funds into the LP vault, wraps SOL to WSOL if required
     *
     * @param signer
     * @param token
     * @param amount
     * @param feeRate
     */
    txsDeposit(signer, token, amount, feeRate) {
        return __awaiter(this, void 0, void 0, function* () {
            const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer);
            feeRate = feeRate || (yield this.getFeeRate(signer, token));
            const action = new SolanaAction_1.SolanaAction(signer, this.root);
            let wrapping = false;
            if (token.equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS)) {
                const account = yield (0, Utils_1.tryWithRetries)(() => this.root.Tokens.getATAOrNull(ata), this.retryPolicy);
                let balance = account == null ? new BN(0) : new BN(account.amount.toString());
                if (balance.lt(amount)) {
                    action.add(this.root.Tokens.Wrap(signer, amount.sub(balance), account == null));
                    wrapping = true;
                }
            }
            action.addAction(yield this.Deposit(signer, token, amount));
            this.logger.debug("txsDeposit(): deposit TX created, token: " + token.toString() +
                " amount: " + amount.toString(10) + " wrapping: " + wrapping);
            return [yield action.tx(feeRate)];
        });
    }
    getFeeRate(signer, token) {
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer);
        return this.root.Fees.getFeeRate([
            signer,
            ata,
            this.root.SwapUserVault(signer, token),
            this.root.SwapVault(token)
        ]);
    }
}
exports.SolanaLpVault = SolanaLpVault;
SolanaLpVault.CUCosts = {
    WITHDRAW: 50000,
    DEPOSIT: 50000
};
