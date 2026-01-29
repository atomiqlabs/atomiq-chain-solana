import {Connection, Keypair, PublicKey, SendOptions, Transaction} from "@solana/web3.js";
import {SolanaFees} from "./modules/SolanaFees";
import {SolanaBlocks} from "./modules/SolanaBlocks";
import {SolanaSlots} from "./modules/SolanaSlots";
import {SolanaTokens} from "./modules/SolanaTokens";
import {SignedSolanaTx, SolanaTransactions, SolanaTx} from "./modules/SolanaTransactions";
import {SolanaSignatures} from "./modules/SolanaSignatures";
import {SolanaEvents} from "./modules/SolanaEvents";
import {getLogger} from "../../utils/Utils";
import {ChainInterface, TransactionConfirmationOptions} from "@atomiqlabs/base";
import {SolanaAddresses} from "./modules/SolanaAddresses";
import {SolanaSigner} from "../wallet/SolanaSigner";
import {Buffer} from "buffer";
import {SolanaKeypairWallet} from "../wallet/SolanaKeypairWallet";
import {Wallet} from "@coral-xyz/anchor/dist/cjs/provider";

/**
 * Retry policy configuration for Solana RPC calls
 * @category Chain Interface
 */
export type SolanaRetryPolicy = {
    maxRetries?: number,
    delay?: number,
    exponential?: boolean,
    transactionResendInterval?: number
}

/**
 * Main chain interface for interacting with Solana blockchain
 * @category Chain Interface
 */
export class SolanaChainInterface implements ChainInterface<
    SolanaTx,
    SignedSolanaTx,
    SolanaSigner,
    "SOLANA",
    Wallet
> {
    readonly chainId = "SOLANA";

    public readonly SLOT_TIME = 400;
    public readonly TX_SLOT_VALIDITY = 151;

    readonly connection: Connection;
    readonly retryPolicy?: SolanaRetryPolicy;

    public readonly Blocks: SolanaBlocks;
    public Fees: SolanaFees;
    public readonly Slots: SolanaSlots;
    public readonly Tokens: SolanaTokens;
    public readonly Transactions: SolanaTransactions;
    public readonly Signatures: SolanaSignatures;
    public readonly Events: SolanaEvents;

    protected readonly logger = getLogger(this.constructor.name+": ");

    constructor(
        connection: Connection,
        retryPolicy?: SolanaRetryPolicy,
        solanaFeeEstimator: SolanaFees = new SolanaFees(connection)
    ) {
        this.connection = connection;
        this.retryPolicy = retryPolicy;

        this.Blocks = new SolanaBlocks(this);
        this.Fees = solanaFeeEstimator;
        this.Slots = new SolanaSlots(this);
        this.Tokens = new SolanaTokens(this);
        this.Transactions = new SolanaTransactions(this);
        this.Signatures = new SolanaSignatures(this);
        this.Events = new SolanaEvents(this);
    }

    /**
     * @inheritDoc
     */
    async getBalance(signer: string, tokenAddress: string): Promise<bigint> {
        const token = new PublicKey(tokenAddress);
        const publicKey = new PublicKey(signer);

        let { balance } = await this.Tokens.getTokenBalance(publicKey, token);
        if(token.equals(SolanaTokens.WSOL_ADDRESS)) {
            const accountRentExemptCost = 1000000n;
            balance = balance - accountRentExemptCost;
            if(balance < 0n) balance = 0n;
        }
        this.logger.debug("getBalance(): token balance, token: "+token.toBase58()+" balance: "+balance.toString(10));
        return balance;
    }

    /**
     * @inheritDoc
     */
    isValidAddress(address: string): boolean {
        return SolanaAddresses.isValidAddress(address);
    }

    /**
     * @inheritDoc
     */
    normalizeAddress(address: string): string {
        return address;
    }

    /**
     * @inheritDoc
     */
    getNativeCurrencyAddress(): string {
        return this.Tokens.getNativeCurrencyAddress().toString();
    }

    /**
     * @inheritDoc
     */
    txsTransfer(signer: string, token: string, amount: bigint, dstAddress: string, feeRate?: string): Promise<SolanaTx[]> {
        return this.Tokens.txsTransfer(new PublicKey(signer), new PublicKey(token), amount, new PublicKey(dstAddress), feeRate);
    }

    /**
     * @inheritDoc
     */
    async transfer(
        signer: SolanaSigner,
        token: string,
        amount: bigint,
        dstAddress: string,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        const txs = await this.Tokens.txsTransfer(signer.getPublicKey(), new PublicKey(token), amount, new PublicKey(dstAddress), txOptions?.feeRate);
        const [txId] = await this.Transactions.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }


    ////////////////////////////////////////////
    //// Transactions
    /**
     * @inheritDoc
     */
    sendAndConfirm(
        signer: SolanaSigner,
        txs: SolanaTx[],
        waitForConfirmation?: boolean,
        abortSignal?: AbortSignal,
        parallel?: boolean,
        onBeforePublish?: (txId: string, rawTx: string) => Promise<void>
    ): Promise<string[]> {
        return this.Transactions.sendAndConfirm(signer, txs, waitForConfirmation, abortSignal, parallel, onBeforePublish);
    }

    /**
     * @inheritDoc
     */
    sendSignedAndConfirm(
        txs: SignedSolanaTx[],
        waitForConfirmation?: boolean,
        abortSignal?: AbortSignal,
        parallel?: boolean,
        onBeforePublish?: (txId: string, rawTx: string) => Promise<void>
    ): Promise<string[]> {
        return this.Transactions.sendSignedAndConfirm(txs, waitForConfirmation, abortSignal, parallel, onBeforePublish);
    }

    /**
     * @inheritDoc
     */
    serializeTx(tx: SolanaTx): Promise<string> {
        return Promise.resolve(this.Transactions.serializeUnsignedTx(tx));
    }

    /**
     * @inheritDoc
     */
    deserializeTx(txData: string): Promise<SolanaTx> {
        return Promise.resolve(this.Transactions.deserializeUnsignedTx(txData));
    }

    /**
     * @inheritDoc
     */
    serializeSignedTx(tx: Transaction): Promise<string> {
        return Promise.resolve(this.Transactions.serializeSignedTx(tx));
    }

    /**
     * @inheritDoc
     */
    deserializeSignedTx(txData: string): Promise<Transaction> {
        return Promise.resolve(this.Transactions.deserializeSignedTransaction(txData));
    }

    /**
     * @inheritDoc
     */
    getTxIdStatus(txId: string): Promise<"not_found" | "pending" | "success" | "reverted"> {
        return this.Transactions.getTxIdStatus(txId);
    }

    /**
     * @inheritDoc
     */
    getTxStatus(tx: string): Promise<"not_found" | "pending" | "success" | "reverted"> {
        return this.Transactions.getTxStatus(tx);
    }

    /**
     * @inheritDoc
     */
    async getFinalizedBlock(): Promise<{ height: number; blockHash: string }> {
        const {block} = await this.Blocks.findLatestParsedBlock("finalized");
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
    offBeforeTxReplace(callback: (oldTx: string, oldTxId: string, newTx: string, newTxId: string) => Promise<void>): boolean {
        return true;
    }

    /**
     * @inheritDoc
     */
    onBeforeTxReplace(callback: (oldTx: string, oldTxId: string, newTx: string, newTxId: string) => Promise<void>): void {}

    /**
     * @inheritDoc
     */
    onBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): void {
        this.Transactions.onBeforeTxSigned(callback);
    }

    /**
     * @inheritDoc
     */
    offBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): boolean {
        return this.Transactions.offBeforeTxSigned(callback);
    }

    onSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): void {
        this.Transactions.onSendTransaction(callback);
    }

    offSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): boolean {
        return this.Transactions.offSendTransaction(callback);
    }

    /**
     * @inheritDoc
     */
    isValidToken(tokenIdentifier: string): boolean {
        try {
            new PublicKey(tokenIdentifier);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * @inheritDoc
     */
    randomAddress(): string {
        return Keypair.generate().publicKey.toString();
    }

    /**
     * @inheritDoc
     */
    randomSigner(): SolanaSigner {
        const keypair = Keypair.generate();
        const wallet = new SolanaKeypairWallet(keypair);
        return new SolanaSigner(wallet, keypair);
    }

    /**
     * @inheritDoc
     */
    wrapSigner(signer: Wallet): Promise<SolanaSigner> {
        return Promise.resolve(new SolanaSigner(signer));
    }

}