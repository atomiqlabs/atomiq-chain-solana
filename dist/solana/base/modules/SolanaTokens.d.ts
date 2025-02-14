import { SolanaModule } from "../SolanaModule";
import { PublicKey } from "@solana/web3.js";
import { Account } from "@solana/spl-token";
import * as BN from "bn.js";
import { SolanaTx } from "./SolanaTransactions";
import { SolanaAction } from "../SolanaAction";
export declare class SolanaTokens extends SolanaModule {
    static readonly CUCosts: {
        WRAP_SOL: number;
        ATA_CLOSE: number;
        ATA_INIT: number;
        TRANSFER: number;
        TRANSFER_SOL: number;
    };
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
    InitAta(signer: PublicKey, publicKey: PublicKey, token: PublicKey, requiredAta?: PublicKey): SolanaAction | null;
    /**
     * Action for wrapping SOL to WSOL for a specific public key
     *
     * @param publicKey public key of the user for which to wrap the SOL
     * @param amount amount of SOL in lamports (smallest unit) to wrap
     * @param initAta whether we should also initialize the ATA before depositing SOL
     * @constructor
     */
    Wrap(publicKey: PublicKey, amount: BN, initAta: boolean): SolanaAction;
    /**
     * Action for unwrapping WSOL to SOL for a specific public key
     *
     * @param publicKey public key of the user for which to unwrap the sol
     * @constructor
     */
    Unwrap(publicKey: PublicKey): SolanaAction;
    static readonly WSOL_ADDRESS: PublicKey;
    static readonly SPL_ATA_RENT_EXEMPT = 2039280;
    /**
     * Action for transferring the native SOL token, uses provider's public key as a sender
     *
     * @param signer
     * @param recipient
     * @param amount
     * @constructor
     * @private
     */
    private SolTransfer;
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
    private Transfer;
    /**
     * Creates transactions for sending SOL (the native token)
     *
     * @param signer
     * @param amount amount of the SOL in lamports (smallest unit) to send
     * @param recipient recipient's address
     * @param feeRate fee rate to use for the transactions
     * @private
     */
    private txsTransferSol;
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
    private txsTransferTokens;
    /**
     * Checks if the provided string is a valid solana token
     *
     * @param token
     */
    isValidToken(token: string): boolean;
    /**
     * Returns the specific ATA or null if it doesn't exist
     *
     * @param ata
     */
    getATAOrNull(ata: PublicKey): Promise<Account | null>;
    /**
     * Checks whether the specific ATA exists, uses tryWithRetries so retries on failure
     *
     * @param ata
     */
    ataExists(ata: PublicKey): Promise<boolean>;
    /**
     * Returns the rent exempt deposit required to initiate the ATA
     */
    getATARentExemptLamports(): Promise<BN>;
    /**
     * Returns the token balance of the public key
     *
     * @param publicKey
     * @param token
     */
    getTokenBalance(publicKey: PublicKey, token: PublicKey): Promise<{
        balance: BN;
        ataExists: boolean;
    }>;
    /**
     * Returns the native currency address, we use WSOL address as placeholder for SOL
     */
    getNativeCurrencyAddress(): PublicKey;
    /**
     * Parses string base58 representation of the token address to a PublicKey object
     * @param address
     */
    toTokenAddress(address: string): PublicKey;
    /**
     * Create transactions for sending a specific token to a destination address
     *
     * @param signer
     * @param token token to use for the transfer
     * @param amount amount of token in base units to transfer
     * @param dstAddress destination address of the recipient
     * @param feeRate fee rate to use for the transaction
     */
    txsTransfer(signer: PublicKey, token: PublicKey, amount: BN, dstAddress: PublicKey, feeRate?: string): Promise<SolanaTx[]>;
}
