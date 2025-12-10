import {SolanaSwapData, InitInstruction} from "./SolanaSwapData";
import {IdlAccounts} from "@coral-xyz/anchor";
import {
    ParsedTransactionWithMeta,
    PublicKey,
} from "@solana/web3.js";
import {sha256} from "@noble/hashes/sha2";
import {SolanaBtcRelay} from "../btcrelay/SolanaBtcRelay";
import * as programIdl from "./programIdl.json";
import {
    IStorageManager,
    SwapContract,
    ChainSwapType,
    IntermediaryReputationType,
    TransactionConfirmationOptions,
    SignatureData,
    RelaySynchronizer,
    BigIntBufferUtils,
    SwapCommitState,
    SwapCommitStateType, SwapNotCommitedState, SwapExpiredState, SwapPaidState
} from "@atomiqlabs/base";
import {SolanaBtcStoredHeader} from "../btcrelay/headers/SolanaBtcStoredHeader";
import {
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {SwapProgram} from "./programTypes";
import {SolanaChainInterface} from "../chain/SolanaChainInterface";
import {SolanaProgramBase} from "../program/SolanaProgramBase";
import {SolanaTx} from "../chain/modules/SolanaTransactions";
import {SwapInit, SolanaPreFetchData, SolanaPreFetchVerification} from "./modules/SwapInit";
import {SolanaDataAccount, StoredDataAccount} from "./modules/SolanaDataAccount";
import {SwapRefund} from "./modules/SwapRefund";
import {SwapClaim} from "./modules/SwapClaim";
import {SolanaLpVault} from "./modules/SolanaLpVault";
import {Buffer} from "buffer";
import {SolanaSigner} from "../wallet/SolanaSigner";
import {fromClaimHash, toBN, toClaimHash, toEscrowHash} from "../../utils/Utils";
import {SolanaTokens} from "../chain/modules/SolanaTokens";
import * as BN from "bn.js";
import {ProgramEvent} from "../program/modules/SolanaProgramEvents";

function toPublicKeyOrNull(str: string | null | undefined): PublicKey | undefined {
    return str==null ? undefined : new PublicKey(str);
}

const MAX_PARALLEL_COMMIT_STATUS_CHECKS = 5;

export class SolanaSwapProgram
    extends SolanaProgramBase<SwapProgram>
    implements SwapContract<
        SolanaSwapData,
        SolanaTx,
        SolanaPreFetchData,
        SolanaPreFetchVerification,
        SolanaSigner,
        "SOLANA"
    > {

    ////////////////////////
    //// Constants
    public readonly ESCROW_STATE_RENT_EXEMPT = 2658720;

    ////////////////////////
    //// PDA accessors
    readonly SwapVaultAuthority = this.pda("authority");
    readonly SwapVault = this.pda("vault", (tokenAddress: PublicKey) => [tokenAddress.toBuffer()]);
    readonly SwapUserVault = this.pda("uservault",
        (publicKey: PublicKey, tokenAddress: PublicKey) => [publicKey.toBuffer(), tokenAddress.toBuffer()]
    );
    readonly SwapEscrowState = this.pda("state", (hash: Buffer) => [hash]);

    ////////////////////////
    //// Timeouts
    readonly chainId: "SOLANA" = "SOLANA";
    readonly claimWithSecretTimeout: number = 45;
    readonly claimWithTxDataTimeout: number = 120;
    readonly refundTimeout: number = 45;
    readonly claimGracePeriod: number = 10*60;
    readonly refundGracePeriod: number = 10*60;
    readonly authGracePeriod: number = 5*60;

    ////////////////////////
    //// Services
    readonly Init: SwapInit;
    readonly Refund: SwapRefund;
    readonly Claim: SwapClaim;
    readonly DataAccount: SolanaDataAccount;
    readonly LpVault: SolanaLpVault;

    constructor(
        chainInterface: SolanaChainInterface,
        btcRelay: SolanaBtcRelay<any>,
        storage: IStorageManager<StoredDataAccount>,
        programAddress?: string
    ) {
        super(chainInterface, programIdl, programAddress);

        this.Init = new SwapInit(chainInterface, this);
        this.Refund = new SwapRefund(chainInterface, this);
        this.Claim = new SwapClaim(chainInterface, this, btcRelay);
        this.DataAccount = new SolanaDataAccount(chainInterface, this, storage);
        this.LpVault = new SolanaLpVault(chainInterface, this);
    }

    async start(): Promise<void> {
        await this.DataAccount.init();
    }

    getClaimableDeposits(signer: string): Promise<{count: number, totalValue: bigint}> {
        return this.DataAccount.getDataAccountsInfo(new PublicKey(signer));
    }

    claimDeposits(signer: SolanaSigner): Promise<{txIds: string[], count: number, totalValue: bigint}> {
        return this.DataAccount.sweepDataAccounts(signer);
    }

    ////////////////////////////////////////////
    //// Signatures
    preFetchForInitSignatureVerification(data: SolanaPreFetchData): Promise<SolanaPreFetchVerification> {
        return this.Init.preFetchForInitSignatureVerification(data);
    }

    preFetchBlockDataForSignatures(): Promise<SolanaPreFetchData> {
        return this.Init.preFetchBlockDataForSignatures();
    }

    getInitSignature(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number, preFetchedBlockData?: SolanaPreFetchData, feeRate?: string): Promise<SignatureData> {
        return this.Init.signSwapInitialization(signer, swapData, authorizationTimeout, preFetchedBlockData, feeRate);
    }

    isValidInitAuthorization(signer: string, swapData: SolanaSwapData, sig: SignatureData, feeRate?: string, preFetchedData?: SolanaPreFetchVerification): Promise<Buffer> {
        return this.Init.isSignatureValid(signer, swapData, sig.timeout, sig.prefix, sig.signature, feeRate, preFetchedData);
    }

    getInitAuthorizationExpiry(swapData: SolanaSwapData, sig: SignatureData, preFetchedData?: SolanaPreFetchVerification): Promise<number> {
        return this.Init.getSignatureExpiry(sig.timeout, sig.signature, preFetchedData);
    }

    isInitAuthorizationExpired(swapData: SolanaSwapData, sig: SignatureData): Promise<boolean> {
        return this.Init.isSignatureExpired(sig.signature, sig.timeout);
    }

    getRefundSignature(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number): Promise<SignatureData> {
        return this.Refund.signSwapRefund(signer, swapData, authorizationTimeout);
    }

    isValidRefundAuthorization(swapData: SolanaSwapData, sig: SignatureData): Promise<Buffer> {
        return this.Refund.isSignatureValid(swapData, sig.timeout, sig.prefix, sig.signature);
    }

    getDataSignature(signer: SolanaSigner, data: Buffer): Promise<string> {
        return this.Chain.Signatures.getDataSignature(signer, data);
    }

    isValidDataSignature(data: Buffer, signature: string, publicKey: string): Promise<boolean> {
        return this.Chain.Signatures.isValidDataSignature(data, signature, publicKey);
    }

    ////////////////////////////////////////////
    //// Swap data utils
    /**
     * Checks whether the claim is claimable by us, that means not expired, we are claimer & the swap is commited
     *
     * @param signer
     * @param data
     */
    async isClaimable(signer: string, data: SolanaSwapData): Promise<boolean> {
        if(!data.isClaimer(signer)) return false;
        if(await this.isExpired(signer, data)) return false;
        return await this.isCommited(data);
    }

    /**
     * Checks whether a swap is commited, i.e. the swap still exists on-chain and was not claimed nor refunded
     *
     * @param swapData
     */
    async isCommited(swapData: SolanaSwapData): Promise<boolean> {
        const paymentHash = Buffer.from(swapData.paymentHash, "hex");

        const account = await this.program.account.escrowState.fetchNullable(this.SwapEscrowState(paymentHash));
        if(account==null) return false;

        return swapData.correctPDA(account);
    }

    /**
     * Checks whether the swap is expired, takes into consideration possible on-chain time skew, therefore for claimer
     *  the swap expires a bit sooner than it should've & for the offerer it expires a bit later
     *
     * @param signer
     * @param data
     */
    isExpired(signer: string, data: SolanaSwapData): Promise<boolean> {
        let currentTimestamp: BN = new BN(Math.floor(Date.now()/1000));
        if(data.isClaimer(signer)) currentTimestamp = currentTimestamp.add(new BN(this.claimGracePeriod));
        if(data.isOfferer(signer)) currentTimestamp = currentTimestamp.sub(new BN(this.refundGracePeriod));
        return Promise.resolve(data.expiry.lt(currentTimestamp));
    }

    /**
     * Checks if the swap is refundable by us, checks if we are offerer, if the swap is already expired & if the swap
     *  is still commited
     *
     * @param signer
     * @param data
     */
    async isRequestRefundable(signer: string, data: SolanaSwapData): Promise<boolean> {
        //Swap can only be refunded by the offerer
        if(!data.isOfferer(signer)) return false;
        if(!(await this.isExpired(signer, data))) return false;
        return await this.isCommited(data);
    }

    /**
     * Get the swap payment hash to be used for an on-chain swap, this just uses a sha256 hash of the values
     *
     * @param outputScript output script required to claim the swap
     * @param amount sats sent required to claim the swap
     * @param confirmations
     * @param nonce swap nonce uniquely identifying the transaction to prevent replay attacks
     */
    getHashForOnchain(outputScript: Buffer, amount: bigint, confirmations: number, nonce?: bigint): Buffer {
        nonce ??= 0n;
        const paymentHash = Buffer.from(sha256(Buffer.concat([
            BigIntBufferUtils.toBuffer(nonce, "le", 8),
            BigIntBufferUtils.toBuffer(amount, "le", 8),
            outputScript
        ]))).toString("hex");
        return Buffer.from(toClaimHash(paymentHash, nonce, confirmations), "hex");
    }

    getHashForHtlc(swapHash: Buffer): Buffer {
        return Buffer.from(toClaimHash(
            swapHash.toString("hex"),
            0n,
            0
        ), "hex");
    }

    getHashForTxId(txId: string, confirmations: number): Buffer {
        return Buffer.from(toClaimHash(
            Buffer.from(txId, "hex").reverse().toString("hex"),
            0n,
            confirmations
        ), "hex");
    }

    ////////////////////////////////////////////
    //// Swap data getters
    /**
     * Gets the status of the specific swap, this also checks if we are offerer/claimer & checks for expiry (to see
     *  if swap is refundable)
     *
     * @param signer
     * @param data
     */
    async getCommitStatus(signer: string, data: SolanaSwapData): Promise<SwapCommitState> {
        const escrowStateKey = this.SwapEscrowState(Buffer.from(data.paymentHash, "hex"));
        const [escrowState, isExpired] = await Promise.all([
            this.program.account.escrowState.fetchNullable(escrowStateKey) as Promise<IdlAccounts<SwapProgram>["escrowState"]>,
            this.isExpired(signer,data)
        ]);

        if(escrowState!=null) {
            if(data.correctPDA(escrowState)) {
                if(data.isOfferer(signer) && isExpired) return {type: SwapCommitStateType.REFUNDABLE};
                return {type: SwapCommitStateType.COMMITED};
            }

            if(data.isOfferer(signer) && isExpired) return {type: SwapCommitStateType.EXPIRED};
            return {type: SwapCommitStateType.NOT_COMMITED};
        }

        //Check if paid or what
        const status: SwapNotCommitedState | SwapExpiredState | SwapPaidState | null = await this.Events.findInEvents(escrowStateKey, async (event, tx) => {
            if(event.name==="ClaimEvent") {
                const paymentHash = Buffer.from(event.data.hash).toString("hex");
                if(paymentHash!==data.paymentHash) return null;
                if(!event.data.sequence.eq(data.sequence)) return null;
                return {
                    type: SwapCommitStateType.PAID,
                    getClaimTxId: () => Promise.resolve(tx.transaction.signatures[0]),
                    getClaimResult: () => Promise.resolve(Buffer.from(event.data.secret).toString("hex")),
                    getTxBlock: () => Promise.resolve({
                        blockHeight: tx.slot,
                        blockTime: tx.blockTime!
                    })
                }
            }
            if(event.name==="RefundEvent") {
                const paymentHash = Buffer.from(event.data.hash).toString("hex");
                if(paymentHash!==data.paymentHash) return null;
                if(!event.data.sequence.eq(data.sequence)) return null;
                return {
                    type: isExpired ? SwapCommitStateType.EXPIRED : SwapCommitStateType.NOT_COMMITED,
                    getRefundTxId: () => Promise.resolve(tx.transaction.signatures[0]),
                    getTxBlock: () => Promise.resolve({
                        blockHeight: tx.slot,
                        blockTime: tx.blockTime!
                    })
                };
            }
        });
        if(status!=null) return status;

        if(isExpired) return {type: SwapCommitStateType.EXPIRED};
        return {type: SwapCommitStateType.NOT_COMMITED};
    }

    async getCommitStatuses(request: { signer: string; swapData: SolanaSwapData }[]): Promise<{
        [p: string]: SwapCommitState
    }> {
        const result: {
            [p: string]: SwapCommitState
        } = {};
        let promises: Promise<void>[] = [];
        for(let {signer, swapData} of request) {
            promises.push(this.getCommitStatus(signer, swapData).then(val => {
                result[swapData.getEscrowHash()] = val;
            }));
            if(promises.length>=MAX_PARALLEL_COMMIT_STATUS_CHECKS) {
                await Promise.all(promises);
                promises = [];
            }
        }
        await Promise.all(promises);
        return result;
    }

    /**
     * Checks the status of the specific payment hash
     *
     * @param claimHash
     */
    async getClaimHashStatus(claimHash: string): Promise<SwapCommitStateType> {
        const {paymentHash} = fromClaimHash(claimHash);
        const escrowStateKey = this.SwapEscrowState(Buffer.from(paymentHash, "hex"));
        const abortController = new AbortController();

        //Start fetching events before checking escrow PDA, this call is used when quoting, so saving 100ms here helps a lot!
        const eventsPromise = this.Events.findInEvents(escrowStateKey, async (event) => {
            if(event.name==="ClaimEvent") return SwapCommitStateType.PAID;
            if(event.name==="RefundEvent") return SwapCommitStateType.NOT_COMMITED;
        }, abortController.signal).catch(e => {
            abortController.abort(e)
            return null;
        });

        const escrowState = await this.program.account.escrowState.fetchNullable(escrowStateKey);
        abortController.signal.throwIfAborted();
        if(escrowState!=null) {
            abortController.abort();
            return SwapCommitStateType.COMMITED;
        }

        //Check if paid or what
        const eventsStatus = await eventsPromise;
        abortController.signal.throwIfAborted();
        if(eventsStatus!=null) return eventsStatus;

        return SwapCommitStateType.NOT_COMMITED;
    }

    /**
     * Returns the data committed for a specific payment hash, or null if no data is currently commited for
     *  the specific swap
     *
     * @param claimHashHex
     */
    async getCommitedData(claimHashHex: string): Promise<SolanaSwapData | null> {
        const {paymentHash} = fromClaimHash(claimHashHex);
        const paymentHashBuffer = Buffer.from(paymentHash, "hex");

        const account: IdlAccounts<SwapProgram>["escrowState"] | null =
            await this.program.account.escrowState.fetchNullable(
                this.SwapEscrowState(paymentHashBuffer)
            );
        if(account==null) return null;

        return SolanaSwapData.fromEscrowState(account);
    }

    async getHistoricalSwaps(signer: string, startBlockheight?: number): Promise<{
        swaps: {
            [escrowHash: string]: {
                init?: {
                    data: SolanaSwapData,
                    getInitTxId: () => Promise<string>,
                    getTxBlock: () => Promise<{
                        blockTime: number,
                        blockHeight: number
                    }>
                },
                state: SwapCommitState
            }
        },
        latestBlockheight?: number
    }> {
        let latestBlockheight: number | undefined;

        const events: {event: ProgramEvent<SwapProgram>, tx: ParsedTransactionWithMeta}[] = [];

        await this.Events.findInEvents(new PublicKey(signer), async (event, tx) => {
            if(latestBlockheight==null) latestBlockheight = tx.slot;
            events.push({event, tx});
        }, undefined, undefined, startBlockheight);

        this.logger.debug(`getHistoricalSwaps(): Found ${events.length} atomiq related events!`);

        const swapsOpened: {[escrowHash: string]: {
            data: SolanaSwapData,
            getInitTxId: () => Promise<string>,
            getTxBlock: () => Promise<{
                blockTime: number,
                blockHeight: number
            }>
        }} = {};
        const resultingSwaps: {
            [escrowHash: string]: {
                init?: {
                    data: SolanaSwapData,
                    getInitTxId: () => Promise<string>,
                    getTxBlock: () => Promise<{
                        blockTime: number,
                        blockHeight: number
                    }>
                },
                state: SwapCommitState
            }
        } = {};

        events.reverse();
        for(let {event, tx} of events) {
            const txSignature = tx.transaction.signatures[0];
            const paymentHash: string = Buffer.from(event.data.hash).toString("hex");
            const escrowHash = toEscrowHash(paymentHash, event.data.sequence);

            if(event.name==="InitializeEvent") {
                //Parse swap data from initialize event
                const txoHash: string = Buffer.from(event.data.txoHash).toString("hex");
                const instructions = this.Events.decodeInstructions(tx.transaction.message);
                if(instructions == null) {
                    this.logger.warn(`getHistoricalSwaps(): Skipping tx ${txSignature} because cannot parse instructions!`);
                    continue;
                }

                const initIx = instructions.find(
                  ix => ix!=null && (ix.name === "offererInitializePayIn" || ix.name === "offererInitialize")
                ) as InitInstruction;
                if(initIx == null) {
                    this.logger.warn(`getHistoricalSwaps(): Skipping tx ${txSignature} because init instruction not found!`);
                    continue;
                }

                swapsOpened[escrowHash] = {
                    data: SolanaSwapData.fromInstruction(initIx, txoHash),
                    getInitTxId: () => Promise.resolve(txSignature),
                    getTxBlock: () => Promise.resolve({
                        blockHeight: tx.slot,
                        blockTime: tx.blockTime!
                    })
                };
            }

            if(event.name==="ClaimEvent") {
                const foundSwapData = swapsOpened[escrowHash];
                delete swapsOpened[escrowHash];
                resultingSwaps[escrowHash] = {
                    init: foundSwapData,
                    state: {
                        type: SwapCommitStateType.PAID,
                        getClaimTxId: () => Promise.resolve(txSignature),
                        getClaimResult: () => Promise.resolve(Buffer.from(event.data.secret).toString("hex")),
                        getTxBlock: () => Promise.resolve({
                            blockHeight: tx.slot,
                            blockTime: tx.blockTime!
                        })
                    }
                }
            }

            if(event.name==="RefundEvent") {
                const foundSwapData = swapsOpened[escrowHash];
                delete swapsOpened[escrowHash];
                const isExpired = foundSwapData!=null && await this.isExpired(signer, foundSwapData.data);
                resultingSwaps[escrowHash] = {
                    init: foundSwapData,
                    state: {
                        type: isExpired ? SwapCommitStateType.EXPIRED : SwapCommitStateType.NOT_COMMITED,
                        getRefundTxId: () => Promise.resolve(txSignature),
                        getTxBlock: () => Promise.resolve({
                            blockHeight: tx.slot,
                            blockTime: tx.blockTime!
                        })
                    }
                }
            }
        }

        this.logger.debug(`getHistoricalSwaps(): Found ${Object.keys(resultingSwaps).length} settled swaps!`);
        this.logger.debug(`getHistoricalSwaps(): Found ${Object.keys(swapsOpened).length} unsettled swaps!`);

        for(let escrowHash in swapsOpened) {
            const foundSwapData = swapsOpened[escrowHash];
            const isExpired = await this.isExpired(signer, foundSwapData.data);
            resultingSwaps[escrowHash] = {
                init: foundSwapData,
                state: foundSwapData.data.isOfferer(signer) && isExpired
                  ? {type: SwapCommitStateType.REFUNDABLE}
                  : {type: SwapCommitStateType.COMMITED}
            }
        }

        return {
            swaps: resultingSwaps,
            latestBlockheight: latestBlockheight ?? startBlockheight
        }
    }

    ////////////////////////////////////////////
    //// Swap data initializer
    createSwapData(
        type: ChainSwapType,
        offerer: string,
        claimer: string,
        token: string,
        amount: bigint,
        claimHash: string,
        sequence: bigint,
        expiry: bigint,
        payIn: boolean,
        payOut: boolean,
        securityDeposit: bigint,
        claimerBounty: bigint,
        depositToken?: string
    ): Promise<SolanaSwapData> {
        if(depositToken!=null) {
            if(!new PublicKey(depositToken).equals(SolanaTokens.WSOL_ADDRESS)) throw new Error("Only SOL supported as deposit token!");
        }
        const tokenAddr: PublicKey = new PublicKey(token);
        const offererKey = new PublicKey(offerer);
        const claimerKey = new PublicKey(claimer);
        const {paymentHash, nonce, confirmations} = fromClaimHash(claimHash);
        const swapData = new SolanaSwapData({
            offerer: offererKey,
            claimer: claimerKey,
            token: tokenAddr,
            amount: toBN(amount),
            paymentHash,
            sequence: toBN(sequence),
            expiry: toBN(expiry),
            nonce,
            confirmations,
            payOut,
            kind: SolanaSwapData.typeToKind(type),
            payIn,
            offererAta: payIn ? getAssociatedTokenAddressSync(tokenAddr, offererKey) : PublicKey.default,
            claimerAta: payOut ? getAssociatedTokenAddressSync(tokenAddr, claimerKey) : PublicKey.default,
            securityDeposit: toBN(securityDeposit),
            claimerBounty: toBN(claimerBounty)
        });
        return Promise.resolve(swapData);
    }

    ////////////////////////////////////////////
    //// Utils
    async getBalance(signer: string, tokenAddress: string, inContract: boolean): Promise<bigint> {
        if(!inContract) {
            return await this.Chain.getBalance(signer, tokenAddress);
        }

        const token = new PublicKey(tokenAddress);
        const publicKey = new PublicKey(signer);

        return await this.getIntermediaryBalance(publicKey, token);
    }

    getIntermediaryData(address: string, token: string): Promise<{
        balance: bigint,
        reputation: IntermediaryReputationType
    } | null> {
        return this.LpVault.getIntermediaryData(new PublicKey(address), new PublicKey(token));
    }

    getIntermediaryReputation(address: string, token: string): Promise<IntermediaryReputationType | null> {
        return this.LpVault.getIntermediaryReputation(new PublicKey(address), new PublicKey(token));
    }

    getIntermediaryBalance(address: PublicKey, token: PublicKey): Promise<bigint> {
        return this.LpVault.getIntermediaryBalance(address, token);
    }

    ////////////////////////////////////////////
    //// Transaction initializers
    async txsClaimWithSecret(
        signer: string | SolanaSigner,
        swapData: SolanaSwapData,
        secret: string,
        checkExpiry?: boolean,
        initAta?: boolean,
        feeRate?: string,
        skipAtaCheck?: boolean
    ): Promise<SolanaTx[]> {
        return this.Claim.txsClaimWithSecret(typeof(signer)==="string" ? new PublicKey(signer) : signer.getPublicKey(), swapData, secret, checkExpiry, initAta, feeRate, skipAtaCheck)
    }

    async txsClaimWithTxData(
        signer: string | SolanaSigner,
        swapData: SolanaSwapData,
        tx: { blockhash: string, confirmations: number, txid: string, hex: string, height: number },
        requiredConfirmations: number,
        vout: number,
        commitedHeader?: SolanaBtcStoredHeader,
        synchronizer?: RelaySynchronizer<any, SolanaTx, any>,
        initAta?: boolean,
        feeRate?: string,
    ): Promise<SolanaTx[]> {
        if(swapData.confirmations!==requiredConfirmations) throw new Error("Invalid requiredConfirmations provided!");
        const {txs} = await this.Claim.txsClaimWithTxData(
            typeof(signer)==="string" ? new PublicKey(signer) : signer,
            swapData, tx, vout, commitedHeader, synchronizer, initAta, feeRate
        );
        return txs;
    }

    txsRefund(signer: string, swapData: SolanaSwapData, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]> {
        if(!swapData.isOfferer(signer)) throw new Error("Only offerer can refund on Solana");
        return this.Refund.txsRefund(swapData, check, initAta, feeRate);
    }

    txsRefundWithAuthorization(signer: string, swapData: SolanaSwapData, sig: SignatureData, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]> {
        if(!swapData.isOfferer(signer)) throw new Error("Only offerer can refund on Solana");
        return this.Refund.txsRefundWithAuthorization(swapData, sig.timeout, sig.prefix, sig.signature,check,initAta,feeRate);
    }

    txsInit(sender: string, swapData: SolanaSwapData, sig: SignatureData, skipChecks?: boolean, feeRate?: string): Promise<SolanaTx[]> {
        if(swapData.isPayIn()) {
            if(!swapData.isOfferer(sender)) throw new Error("Only offerer can create payIn=true swap");
            return this.Init.txsInitPayIn(swapData, sig.timeout, sig.prefix, sig.signature, skipChecks, feeRate);
        } else {
            if(!swapData.isClaimer(sender)) throw new Error("Only claimer can create payIn=false swap");
            return this.Init.txsInit(swapData, sig.timeout, sig.prefix, sig.signature, skipChecks, feeRate);
        }
    }

    txsWithdraw(signer: string, token: string, amount: bigint, feeRate?: string): Promise<SolanaTx[]> {
        return this.LpVault.txsWithdraw(new PublicKey(signer), new PublicKey(token), amount, feeRate);
    }

    txsDeposit(signer: string, token: string, amount: bigint, feeRate?: string): Promise<SolanaTx[]> {
        return this.LpVault.txsDeposit(new PublicKey(signer), new PublicKey(token), amount, feeRate);
    }

    ////////////////////////////////////////////
    //// Executors
    async claimWithSecret(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        secret: string,
        checkExpiry?: boolean,
        initAta?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        const result = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, checkExpiry, initAta, txOptions?.feeRate);
        const [signature] = await this.Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return signature;
    }

    async claimWithTxData(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        tx: { blockhash: string, confirmations: number, txid: string, hex: string, height: number },
        requiredConfirmations: number,
        vout: number,
        commitedHeader?: SolanaBtcStoredHeader,
        synchronizer?: RelaySynchronizer<any, SolanaTx, any>,
        initAta?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        if(requiredConfirmations!==swapData.confirmations) throw new Error("Invalid requiredConfirmations provided!");

        const {txs, claimTxIndex, storageAcc} = await this.Claim.txsClaimWithTxData(
            signer, swapData, tx, vout,
            commitedHeader, synchronizer, initAta, txOptions?.feeRate
        );

        const signatures = await this.Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        await this.DataAccount.removeDataAccount(storageAcc);

        return signatures[claimTxIndex] ?? signatures[0];
    }

    async refund(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        check?: boolean,
        initAta?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        let result = await this.txsRefund(signer.getAddress(), swapData, check, initAta, txOptions?.feeRate);

        const [signature] = await this.Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);

        return signature;
    }

    async refundWithAuthorization(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        signature: SignatureData,
        check?: boolean,
        initAta?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        let result = await this.txsRefundWithAuthorization(signer.getAddress(), swapData, signature, check, initAta, txOptions?.feeRate);

        const [txSignature] = await this.Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);

        return txSignature;
    }

    async init(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        signature: SignatureData,
        skipChecks?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        if(swapData.isPayIn()) {
            if(!signer.getPublicKey().equals(swapData.offerer)) throw new Error("Invalid signer provided!");
        } else {
            if(!signer.getPublicKey().equals(swapData.claimer)) throw new Error("Invalid signer provided!");
        }

        const result = await this.txsInit(signer.getAddress(), swapData, signature, skipChecks, txOptions?.feeRate);

        const signatures = await this.Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);

        return signatures[signatures.length-1];
    }

    async initAndClaimWithSecret(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        signature: SignatureData,
        secret: string,
        skipChecks?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string[]> {
        if(!signer.getPublicKey().equals(swapData.claimer)) throw new Error("Invalid signer provided!");

        const txsCommit = await this.txsInit(signer.getAddress(), swapData, signature, skipChecks, txOptions?.feeRate);
        const txsClaim = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, true, false, txOptions?.feeRate, true);

        const signatures = await this.Chain.sendAndConfirm(signer, txsCommit.concat(txsClaim), txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return [signatures[txsCommit.length-1], signatures[signatures.length-1]]
    }

    async withdraw(
        signer: SolanaSigner,
        token: string,
        amount: bigint,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        const txs = await this.LpVault.txsWithdraw(signer.getPublicKey(), new PublicKey(token), amount, txOptions?.feeRate);
        const [txId] = await this.Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }

    async deposit(
        signer: SolanaSigner,
        token: string,
        amount: bigint,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        const txs = await this.LpVault.txsDeposit(signer.getPublicKey(), new PublicKey(token), amount, txOptions?.feeRate);
        const [txId] = await this.Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }

    ////////////////////////////////////////////
    //// Fees
    getInitPayInFeeRate(offerer?: string, claimer?: string, token?: string, claimHash?: string): Promise<string> {
        const paymentHash = claimHash==null ? undefined : fromClaimHash(claimHash).paymentHash;
        return this.Init.getInitPayInFeeRate(
            toPublicKeyOrNull(offerer),
            toPublicKeyOrNull(claimer),
            toPublicKeyOrNull(token),
            paymentHash
        );
    }

    getInitFeeRate(offerer?: string, claimer?: string, token?: string, claimHash?: string): Promise<string> {
        const paymentHash = claimHash==null ? undefined : fromClaimHash(claimHash).paymentHash;
        return this.Init.getInitFeeRate(
            toPublicKeyOrNull(offerer),
            toPublicKeyOrNull(claimer),
            toPublicKeyOrNull(token),
            paymentHash
        );
    }

    getRefundFeeRate(swapData: SolanaSwapData): Promise<string> {
        return this.Refund.getRefundFeeRate(swapData);
    }

    getClaimFeeRate(signer: string, swapData: SolanaSwapData): Promise<string> {
        return this.Claim.getClaimFeeRate(new PublicKey(signer), swapData);
    }

    getClaimFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Claim.getClaimFee(new PublicKey(signer), swapData, feeRate);
    }

    getRawClaimFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Claim.getRawClaimFee(new PublicKey(signer), swapData, feeRate);
    }

    /**
     * Get the estimated solana fee of the commit transaction
     */
    getCommitFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Init.getInitFee(swapData, feeRate);
    }

    /**
     * Get the estimated solana fee of the commit transaction, without any deposits
     */
    getRawCommitFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Init.getRawInitFee(swapData, feeRate);
    }

    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRefundFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Refund.getRefundFee(swapData, feeRate);
    }

    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRawRefundFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Refund.getRawRefundFee(swapData, feeRate);
    }

    getExtraData(outputScript: Buffer, amount: bigint, confirmations: number, nonce?: bigint): Buffer {
        return Buffer.from(sha256(Buffer.concat([
            BigIntBufferUtils.toBuffer(amount, "le", 8),
            outputScript
        ])));
    }

}
