/// <reference types="node" />
/// <reference types="node" />
import { SolanaSwapModule } from "../SolanaSwapModule";
import { PublicKey, Signer } from "@solana/web3.js";
import { IStorageManager, StorageObject } from "@atomiqlabs/base";
import { SolanaSwapProgram } from "../SolanaSwapProgram";
import { SolanaTx } from "../../chain/modules/SolanaTransactions";
import { SolanaSigner } from "../../wallet/SolanaSigner";
import { SolanaChainInterface } from "../../chain/SolanaChainInterface";
export declare class StoredDataAccount implements StorageObject {
    accountKey: PublicKey;
    owner: PublicKey;
    constructor(accountKey: PublicKey, owner: PublicKey);
    constructor(data: any);
    serialize(): any;
}
export declare class SolanaDataAccount extends SolanaSwapModule {
    readonly SwapTxDataAlt: (reversedTxId: Buffer, signer: Signer) => import("@solana/web3.js").Keypair;
    readonly SwapTxDataAltBuffer: (reversedTxId: Buffer, secret: Buffer) => import("@solana/web3.js").Keypair;
    readonly storage: IStorageManager<StoredDataAccount>;
    private static readonly CUCosts;
    /**
     * Action for initialization of the data account
     *
     * @param signer
     * @param accountKey
     * @param dataLength
     * @private
     */
    private InitDataAccount;
    /**
     * Action for closing the specific data account
     *
     * @param signer
     * @param publicKey
     */
    private CloseDataAccount;
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
    private WriteData;
    constructor(chainInterface: SolanaChainInterface, program: SolanaSwapProgram, storage: IStorageManager<StoredDataAccount>);
    /**
     * Saves data account to the storage, the storage is required such that we are able to close the accounts later
     *  manually in case the claim doesn't happen (expires due to fees, etc.)
     *
     * @param signer
     * @param publicKey
     * @private
     */
    private saveDataAccount;
    /**
     * Initializes the data account handler, loads the existing data accounts which should be checked and closed
     */
    init(): Promise<void>;
    /**
     * Removes data account from the list of accounts that should be checked for reclaiming the locked SOL, this should
     *  be called after a batch of transactions claiming the swap was confirmed
     *
     * @param publicKey
     */
    removeDataAccount(publicKey: PublicKey): Promise<void>;
    getDataAccountsInfo(signer: PublicKey): Promise<{
        closePublicKeys: PublicKey[];
        count: number;
        totalValue: bigint;
    }>;
    /**
     * Sweeps all old data accounts, reclaiming the SOL locked in the PDAs
     */
    sweepDataAccounts(signer: SolanaSigner): Promise<{
        txIds: string[];
        count: number;
        totalValue: bigint;
    }>;
    /**
     * Adds the transactions writing (and also initializing if it doesn't exist) data to the data account
     *
     * @param signer
     * @param reversedTxId reversed btc tx id is used to derive the data account address
     * @param writeData full data to be written to the data account
     * @param txs solana transactions array, where txns for writing & initializing will be added
     * @param feeRate fee rate to use for the transactions
     */
    addTxsWriteData(signer: SolanaSigner | PublicKey, reversedTxId: Buffer, writeData: Buffer, txs: SolanaTx[], feeRate: string): Promise<PublicKey>;
}
