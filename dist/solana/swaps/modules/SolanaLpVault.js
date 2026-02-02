"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaLpVault = void 0;
const SolanaSwapModule_1 = require("../SolanaSwapModule");
const SolanaAction_1 = require("../../chain/SolanaAction");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const Utils_1 = require("../../../utils/Utils");
const SolanaTokens_1 = require("../../chain/modules/SolanaTokens");
class SolanaLpVault extends SolanaSwapModule_1.SolanaSwapModule {
    /**
     * Action for withdrawing funds from the LP vault
     *
     * @param signer
     * @param token
     * @param amount
     * @private
     */
    async Withdraw(signer, token, amount) {
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer);
        return new SolanaAction_1.SolanaAction(signer, this.root, await this.swapProgram.methods
            .withdraw((0, Utils_1.toBN)(amount))
            .accounts({
            signer,
            signerAta: ata,
            userData: this.program.SwapUserVault(signer, token),
            vault: this.program.SwapVault(token),
            vaultAuthority: this.program.SwapVaultAuthority,
            mint: token,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID
        })
            .instruction(), SolanaLpVault.CUCosts.WITHDRAW);
    }
    /**
     * Action for depositing funds to the LP vault
     *
     * @param signer
     * @param token
     * @param amount
     * @private
     */
    async Deposit(signer, token, amount) {
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer);
        return new SolanaAction_1.SolanaAction(signer, this.root, await this.swapProgram.methods
            .deposit((0, Utils_1.toBN)(amount))
            .accounts({
            signer,
            signerAta: ata,
            userData: this.program.SwapUserVault(signer, token),
            vault: this.program.SwapVault(token),
            vaultAuthority: this.program.SwapVaultAuthority,
            mint: token,
            systemProgram: web3_js_1.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID
        })
            .instruction(), SolanaLpVault.CUCosts.DEPOSIT);
    }
    /**
     * Returns intermediary's reputation & vault balance for a specific token
     *
     * @param address
     * @param token
     */
    async getIntermediaryData(address, token) {
        const data = await this.swapProgram.account.userAccount.fetchNullable(this.program.SwapUserVault(address, token));
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
            balance: (0, Utils_1.toBigInt)(data.amount),
            reputation: response
        };
    }
    /**
     * Returns intermediary's reputation for a specific token
     *
     * @param address
     * @param token
     */
    async getIntermediaryReputation(address, token) {
        const intermediaryData = await this.getIntermediaryData(address, token);
        return intermediaryData?.reputation ?? null;
    }
    /**
     * Returns the balance of the token an intermediary has in his LP vault
     *
     * @param address
     * @param token
     */
    async getIntermediaryBalance(address, token) {
        const intermediaryData = await this.getIntermediaryData(address, token);
        const balance = intermediaryData?.balance ?? 0n;
        this.logger.debug("getIntermediaryBalance(): token LP balance fetched, token: " + token.toString() +
            " address: " + address + " amount: " + balance.toString());
        return balance;
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
    async txsWithdraw(signer, token, amount, feeRate) {
        const ata = await (0, spl_token_1.getAssociatedTokenAddress)(token, signer);
        feeRate = feeRate || await this.getFeeRate(signer, token);
        const action = new SolanaAction_1.SolanaAction(signer, this.root);
        if (!await this.root.Tokens.ataExists(ata)) {
            action.add(this.root.Tokens.InitAta(signer, signer, token));
        }
        action.add(await this.Withdraw(signer, token, amount));
        const shouldUnwrap = token.equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS);
        if (shouldUnwrap)
            action.add(this.root.Tokens.Unwrap(signer));
        this.logger.debug("txsWithdraw(): withdraw TX created, token: " + token.toString() +
            " amount: " + amount.toString(10) + " unwrapping: " + shouldUnwrap);
        return [await action.tx(feeRate)];
    }
    /**
     * Creates transaction for depositing funds into the LP vault, wraps SOL to WSOL if required
     *
     * @param signer
     * @param token
     * @param amount
     * @param feeRate
     */
    async txsDeposit(signer, token, amount, feeRate) {
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer);
        feeRate = feeRate || await this.getFeeRate(signer, token);
        const action = new SolanaAction_1.SolanaAction(signer, this.root);
        let wrapping = false;
        if (token.equals(SolanaTokens_1.SolanaTokens.WSOL_ADDRESS)) {
            const account = await this.root.Tokens.getATAOrNull(ata);
            let balance = account == null ? 0n : account.amount;
            if (balance < amount) {
                action.add(this.root.Tokens.Wrap(signer, amount - balance, account == null));
                wrapping = true;
            }
        }
        action.addAction(await this.Deposit(signer, token, amount));
        this.logger.debug("txsDeposit(): deposit TX created, token: " + token.toString() +
            " amount: " + amount.toString(10) + " wrapping: " + wrapping);
        return [await action.tx(feeRate)];
    }
    getFeeRate(signer, token) {
        const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(token, signer);
        return this.root.Fees.getFeeRate([
            signer,
            ata,
            this.program.SwapUserVault(signer, token),
            this.program.SwapVault(token)
        ]);
    }
}
exports.SolanaLpVault = SolanaLpVault;
SolanaLpVault.CUCosts = {
    WITHDRAW: 50000,
    DEPOSIT: 50000
};
