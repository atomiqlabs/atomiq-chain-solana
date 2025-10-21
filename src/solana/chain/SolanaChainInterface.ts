import {Connection, Keypair, PublicKey, SendOptions} from "@solana/web3.js";
import {SolanaFees} from "./modules/SolanaFees";
import {SolanaBlocks} from "./modules/SolanaBlocks";
import {SolanaSlots} from "./modules/SolanaSlots";
import {SolanaTokens} from "./modules/SolanaTokens";
import {SolanaTransactions, SolanaTx} from "./modules/SolanaTransactions";
import {SolanaSignatures} from "./modules/SolanaSignatures";
import {SolanaEvents} from "./modules/SolanaEvents";
import {getLogger} from "../../utils/Utils";
import {ChainInterface, TransactionConfirmationOptions} from "@atomiqlabs/base";
import {SolanaAddresses} from "./modules/SolanaAddresses";
import {SolanaSigner} from "../wallet/SolanaSigner";
import {Buffer} from "buffer";
import {SolanaKeypairWallet} from "../wallet/SolanaKeypairWallet";
import {Wallet} from "@coral-xyz/anchor/dist/cjs/provider";

export type SolanaRetryPolicy = {
    maxRetries?: number,
    delay?: number,
    exponential?: boolean,
    transactionResendInterval?: number
}

export class SolanaChainInterface implements ChainInterface<
    SolanaTx,
    SolanaSigner,
    "SOLANA",
    Wallet
> {
    readonly chainId = "SOLANA";

    public readonly SLOT_TIME = 400;
    public readonly TX_SLOT_VALIDITY = 151;

    readonly connection: Connection;
    readonly retryPolicy: SolanaRetryPolicy;

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

    isValidAddress(address: string): boolean {
        return SolanaAddresses.isValidAddress(address);
    }

    normalizeAddress(address: string): string {
        return address;
    }

    getNativeCurrencyAddress(): string {
        return this.Tokens.getNativeCurrencyAddress().toString();
    }

    txsTransfer(signer: string, token: string, amount: bigint, dstAddress: string, feeRate?: string): Promise<SolanaTx[]> {
        return this.Tokens.txsTransfer(new PublicKey(signer), new PublicKey(token), amount, new PublicKey(dstAddress), feeRate);
    }

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

    serializeTx(tx: SolanaTx): Promise<string> {
        return this.Transactions.serializeTx(tx);
    }

    deserializeTx(txData: string): Promise<SolanaTx> {
        return this.Transactions.deserializeTx(txData);
    }

    getTxIdStatus(txId: string): Promise<"not_found" | "pending" | "success" | "reverted"> {
        return this.Transactions.getTxIdStatus(txId);
    }

    getTxStatus(tx: string): Promise<"not_found" | "pending" | "success" | "reverted"> {
        return this.Transactions.getTxStatus(tx);
    }

    async getFinalizedBlock(): Promise<{ height: number; blockHash: string }> {
        const {block} = await this.Blocks.findLatestParsedBlock("finalized");
        return {
            height: block.blockHeight,
            blockHash: block.blockhash
        };
    }


    ///////////////////////////////////
    //// Callbacks & handlers
    offBeforeTxReplace(callback: (oldTx: string, oldTxId: string, newTx: string, newTxId: string) => Promise<void>): boolean {
        return true;
    }

    onBeforeTxReplace(callback: (oldTx: string, oldTxId: string, newTx: string, newTxId: string) => Promise<void>): void {}

    onBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): void {
        this.Transactions.onBeforeTxSigned(callback);
    }

    offBeforeTxSigned(callback: (tx: SolanaTx) => Promise<void>): boolean {
        return this.Transactions.offBeforeTxSigned(callback);
    }

    onSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): void {
        this.Transactions.onSendTransaction(callback);
    }

    offSendTransaction(callback: (tx: Buffer, options?: SendOptions) => Promise<string>): boolean {
        return this.Transactions.offSendTransaction(callback);
    }

    isValidToken(tokenIdentifier: string): boolean {
        try {
            new PublicKey(tokenIdentifier);
            return true;
        } catch (e) {
            return false;
        }
    }

    randomAddress(): string {
        return Keypair.generate().publicKey.toString();
    }

    randomSigner(): SolanaSigner {
        const keypair = Keypair.generate();
        const wallet = new SolanaKeypairWallet(keypair);
        return new SolanaSigner(wallet, keypair);
    }

    wrapSigner(signer: Wallet): Promise<SolanaSigner> {
        return Promise.resolve(new SolanaSigner(signer));
    }

}