import {SolanaSwapModule} from "../SolanaSwapModule";
import {SolanaAction} from "../../chain/SolanaAction";
import {PublicKey, SystemProgram} from "@solana/web3.js";
import {
    Account,
    getAssociatedTokenAddress,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {SolanaTx} from "../../chain/modules/SolanaTransactions";
import {toBigInt, toBN} from "../../../utils/Utils";
import { IntermediaryReputationType } from "@atomiqlabs/base";
import {SolanaTokens} from "../../chain/modules/SolanaTokens";

export class SolanaLpVault extends SolanaSwapModule {

    private static readonly CUCosts = {
        WITHDRAW: 50000,
        DEPOSIT: 50000
    };

    /**
     * Action for withdrawing funds from the LP vault
     *
     * @param signer
     * @param token
     * @param amount
     * @private
     */
    private async Withdraw(signer: PublicKey, token: PublicKey, amount: bigint): Promise<SolanaAction> {
        const ata = getAssociatedTokenAddressSync(token, signer);
        return new SolanaAction(signer, this.root,
            await this.swapProgram.methods
                .withdraw(toBN(amount))
                .accounts({
                    signer,
                    signerAta: ata,
                    userData: this.program.SwapUserVault(signer, token),
                    vault: this.program.SwapVault(token),
                    vaultAuthority: this.program.SwapVaultAuthority,
                    mint: token,
                    tokenProgram: TOKEN_PROGRAM_ID
                })
                .instruction(),
            SolanaLpVault.CUCosts.WITHDRAW
        );
    }

    /**
     * Action for depositing funds to the LP vault
     *
     * @param signer
     * @param token
     * @param amount
     * @private
     */
    private async Deposit(signer: PublicKey, token: PublicKey, amount: bigint): Promise<SolanaAction> {
        const ata = getAssociatedTokenAddressSync(token, signer);
        return new SolanaAction(signer, this.root,
            await this.swapProgram.methods
                .deposit(toBN(amount))
                .accounts({
                    signer,
                    signerAta: ata,
                    userData: this.program.SwapUserVault(signer, token),
                    vault: this.program.SwapVault(token),
                    vaultAuthority: this.program.SwapVaultAuthority,
                    mint: token,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID
                })
                .instruction(),
            SolanaLpVault.CUCosts.DEPOSIT
        );
    }

    /**
     * Returns intermediary's reputation & vault balance for a specific token
     *
     * @param address
     * @param token
     */
    public async getIntermediaryData(address: PublicKey, token: PublicKey): Promise<{
        balance: bigint,
        reputation: IntermediaryReputationType
    } | null> {
        const data = await this.swapProgram.account.userAccount.fetchNullable(
            this.program.SwapUserVault(address, token)
        );

        if(data==null) return null;

        const response: any = [];

        for(let i=0;i<data.successVolume.length;i++) {
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
            balance: toBigInt(data.amount),
            reputation: response
        };
    }

    /**
     * Returns intermediary's reputation for a specific token
     *
     * @param address
     * @param token
     */
    public async getIntermediaryReputation(address: PublicKey, token: PublicKey): Promise<IntermediaryReputationType | null> {
        const intermediaryData = await this.getIntermediaryData(address, token);
        return intermediaryData?.reputation ?? null;
    }

    /**
     * Returns the balance of the token an intermediary has in his LP vault
     *
     * @param address
     * @param token
     */
    public async getIntermediaryBalance(address: PublicKey, token: PublicKey): Promise<bigint> {
        const intermediaryData = await this.getIntermediaryData(address, token);
        const balance: bigint = intermediaryData?.balance ?? 0n;

        this.logger.debug("getIntermediaryBalance(): token LP balance fetched, token: "+token.toString()+
            " address: "+address+" amount: "+balance.toString());

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
    public async txsWithdraw(signer: PublicKey, token: PublicKey, amount: bigint, feeRate?: string): Promise<SolanaTx[]> {
        const ata = await getAssociatedTokenAddress(token, signer);

        feeRate = feeRate || await this.getFeeRate(signer, token);

        const action = new SolanaAction(signer, this.root);
        if(!await this.root.Tokens.ataExists(ata)) {
            action.add(this.root.Tokens.InitAta(signer, signer, token));
        }
        action.add(await this.Withdraw(signer, token, amount));
        const shouldUnwrap = token.equals(SolanaTokens.WSOL_ADDRESS);
        if(shouldUnwrap) action.add(this.root.Tokens.Unwrap(signer));

        this.logger.debug("txsWithdraw(): withdraw TX created, token: "+token.toString()+
            " amount: "+amount.toString(10)+" unwrapping: "+shouldUnwrap);

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
    public async txsDeposit(signer: PublicKey, token: PublicKey, amount: bigint, feeRate?: string): Promise<SolanaTx[]> {
        const ata = getAssociatedTokenAddressSync(token, signer);

        feeRate = feeRate || await this.getFeeRate(signer, token);

        const action = new SolanaAction(signer, this.root);

        let wrapping: boolean = false;
        if(token.equals(SolanaTokens.WSOL_ADDRESS)) {
            const account = await this.root.Tokens.getATAOrNull(ata);
            let balance: bigint = account==null ? 0n : account.amount;
            if(balance < amount) {
                action.add(this.root.Tokens.Wrap(signer, amount - balance, account==null));
                wrapping = true;
            }
        }
        action.addAction(await this.Deposit(signer, token, amount));

        this.logger.debug("txsDeposit(): deposit TX created, token: "+token.toString()+
            " amount: "+amount.toString(10)+" wrapping: "+wrapping);

        return [await action.tx(feeRate)];
    }

    public getFeeRate(signer: PublicKey, token: PublicKey) {
        const ata = getAssociatedTokenAddressSync(token, signer);
        return this.root.Fees.getFeeRate([
            signer,
            ata,
            this.program.SwapUserVault(signer, token),
            this.program.SwapVault(token)
        ])
    }

}