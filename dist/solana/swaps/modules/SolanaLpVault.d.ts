import { SolanaSwapModule } from "../SolanaSwapModule";
import { PublicKey } from "@solana/web3.js";
import { SolanaTx } from "../../chain/modules/SolanaTransactions";
import { IntermediaryReputationType } from "@atomiqlabs/base";
export declare class SolanaLpVault extends SolanaSwapModule {
    private static readonly CUCosts;
    /**
     * Action for withdrawing funds from the LP vault
     *
     * @param signer
     * @param token
     * @param amount
     * @constructor
     * @private
     */
    private Withdraw;
    /**
     * Action for depositing funds to the LP vault
     *
     * @param signer
     * @param token
     * @param amount
     * @constructor
     * @private
     */
    private Deposit;
    /**
     * Returns intermediary's reputation & vault balance for a specific token
     *
     * @param address
     * @param token
     */
    getIntermediaryData(address: PublicKey, token: PublicKey): Promise<{
        balance: bigint;
        reputation: IntermediaryReputationType;
    }>;
    /**
     * Returns intermediary's reputation for a specific token
     *
     * @param address
     * @param token
     */
    getIntermediaryReputation(address: PublicKey, token: PublicKey): Promise<IntermediaryReputationType>;
    /**
     * Returns the balance of the token an intermediary has in his LP vault
     *
     * @param address
     * @param token
     */
    getIntermediaryBalance(address: PublicKey, token: PublicKey): Promise<bigint>;
    /**
     * Creates transactions for withdrawing funds from the LP vault, creates ATA if it doesn't exist and unwraps
     *  WSOL to SOL if required
     *
     * @param signer
     * @param token
     * @param amount
     * @param feeRate
     */
    txsWithdraw(signer: PublicKey, token: PublicKey, amount: bigint, feeRate?: string): Promise<SolanaTx[]>;
    /**
     * Creates transaction for depositing funds into the LP vault, wraps SOL to WSOL if required
     *
     * @param signer
     * @param token
     * @param amount
     * @param feeRate
     */
    txsDeposit(signer: PublicKey, token: PublicKey, amount: bigint, feeRate?: string): Promise<SolanaTx[]>;
    getFeeRate(signer: PublicKey, token: PublicKey): Promise<string>;
}
