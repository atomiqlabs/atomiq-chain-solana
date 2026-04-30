import {SolanaSwapData, InitInstruction} from "./SolanaSwapData";
import {IdlAccounts, Program} from "@coral-xyz/anchor";
import {
    ParsedTransactionWithMeta,
    PublicKey,
} from "@solana/web3.js";
import {sha256} from "@noble/hashes/sha2";
import {SolanaBtcRelay} from "../btcrelay/SolanaBtcRelay";
import * as programIdlV1 from "./v1/programIdl.json";
import * as programIdlV2 from "./v2/programIdl.json";
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
import {SwapProgram} from "./v1/programTypes";
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
import {fromClaimHash, onceAsync, toBN, toClaimHash, toEscrowHash} from "../../utils/Utils";
import {SolanaTokens} from "../chain/modules/SolanaTokens";
import * as BN from "bn.js";
import {ProgramEvent} from "../program/modules/SolanaProgramEvents";
import {SwapProgramV2} from "./v2/programTypes";

export function isSwapProgramV1(obj: any): obj is Program<SwapProgram> {
    return obj.idl.version==="0.1.0";
}

export function isSwapProgramV2(obj: any): obj is Program<SwapProgramV2> {
    return obj.idl.version==="0.2.0";
}

function toPublicKeyOrNull(str: string | null | undefined): PublicKey | undefined {
    return str==null ? undefined : new PublicKey(str);
}

const MAX_PARALLEL_COMMIT_STATUS_CHECKS = 5;

/**
 * Solana swap (escrow manager) program representation handling PrTLC (on-chain) and HTLC (lightning) based swaps.
 *
 * @category Swaps
 */
export class SolanaSwapProgram
    extends SolanaProgramBase<SwapProgram | SwapProgramV2>
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
    /**
     * Rent-exempt amount (lamports) for escrow state accounts.
     */
    public readonly ESCROW_STATE_RENT_EXEMPT: number;

    public readonly version: "v1" | "v2";

    public readonly supportsInitWithoutClaimer: boolean;

    ////////////////////////
    //// PDA accessors
    /**
     * PDA of the swap vault authority.
     * @internal
     */
    static readonly _SwapVaultAuthority = SolanaProgramBase._pda("authority"); // Only necessary for V1 program
    readonly _SwapVaultAuthority = SolanaSwapProgram._SwapVaultAuthority(this.program.programId); // Only necessary for V1 program
    /**
     * PDA helper for global token vault accounts.
     * @internal
     */
    static readonly _SwapVault = SolanaProgramBase._pda("vault", (tokenAddress: PublicKey) => [tokenAddress.toBuffer()]);
    readonly _SwapVault = SolanaSwapProgram._SwapVault.bind(this, this.program.programId);
    /**
     * PDA helper for per-user token vault accounts.
     * @internal
     */
    static readonly _SwapUserVault = SolanaProgramBase._pda("uservault",
        (publicKey: PublicKey, tokenAddress: PublicKey) => [publicKey.toBuffer(), tokenAddress.toBuffer()]
    );
    readonly _SwapUserVault = SolanaSwapProgram._SwapUserVault.bind(this, this.program.programId);
    /**
     * PDA helper for escrow state accounts.
     * @internal
     */
    static readonly _SwapEscrowState = SolanaProgramBase._pda("state", (hash: Buffer) => [hash]);
    readonly _SwapEscrowState = SolanaSwapProgram._SwapEscrowState.bind(this, this.program.programId);

    ////////////////////////
    //// Timeouts
    /**
     * @inheritDoc
     */
    readonly chainId: "SOLANA" = "SOLANA";
    /**
     * @inheritDoc
     */
    readonly claimWithSecretTimeout: number = 45;
    /**
     * @inheritDoc
     */
    readonly claimWithTxDataTimeout: number = 120;
    /**
     * @inheritDoc
     */
    readonly refundTimeout: number = 45;
    /**
     * Grace period (seconds) applied to claimer-side expiry checks.
     */
    private readonly claimGracePeriod: number = 10*60;
    /**
     * Grace period (seconds) applied to offerer-side expiry checks.
     */
    private readonly refundGracePeriod: number = 10*60;
    /**
     * Authorization grace period in seconds.
     * @internal
     */
    readonly _authGracePeriod: number = 5*60;

    ////////////////////////
    //// Services
    /**
     * Swap initialization service.
     */
    private readonly Init: SwapInit;
    /**
     * Swap refund service.
     */
    private readonly Refund: SwapRefund;
    /**
     * Swap claim service.
     */
    private readonly Claim: SwapClaim;
    /**
     * LP vault interaction service.
     */
    private readonly LpVault: SolanaLpVault;
    /**
     * Temporary data-account lifecycle service.
     * @internal
     */
    readonly _DataAccount: SolanaDataAccount;

    constructor(
        chainInterface: SolanaChainInterface,
        btcRelay: SolanaBtcRelay<any>,
        storage: IStorageManager<StoredDataAccount>,
        programAddress?: string,
        version: "v1" | "v2" = "v1"
    ) {
        super(chainInterface, version==="v1" ? programIdlV1 : programIdlV2, programAddress);

        this.version = version;
        this.ESCROW_STATE_RENT_EXEMPT = version==="v1" ? 2658720 : 2665680;
        this.supportsInitWithoutClaimer = version!=="v1";

        this.Init = new SwapInit(chainInterface, this);
        this.Refund = new SwapRefund(chainInterface, this);
        this.Claim = new SwapClaim(chainInterface, this, btcRelay);
        this._DataAccount = new SolanaDataAccount(chainInterface, this, storage);
        this.LpVault = new SolanaLpVault(chainInterface, this);
    }

    /**
     * @inheritDoc
     */
    async start(): Promise<void> {
        await this._DataAccount.init();
    }

    /**
     * @inheritDoc
     */
    getClaimableDeposits(signer: string): Promise<{count: number, totalValue: bigint}> {
        return this._DataAccount.getDataAccountsInfo(new PublicKey(signer));
    }

    /**
     * @inheritDoc
     */
    claimDeposits(signer: SolanaSigner): Promise<{txIds: string[], count: number, totalValue: bigint}> {
        return this._DataAccount.sweepDataAccounts(signer);
    }

    ////////////////////////////////////////////
    //// Signatures
    /**
     * @inheritDoc
     */
    preFetchForInitSignatureVerification(data: SolanaPreFetchData): Promise<SolanaPreFetchVerification> {
        return this.Init.preFetchForInitSignatureVerification(data);
    }

    /**
     * @inheritDoc
     */
    preFetchBlockDataForSignatures(): Promise<SolanaPreFetchData> {
        return this.Init.preFetchBlockDataForSignatures();
    }

    /**
     * @inheritDoc
     */
    getInitSignature(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number, preFetchedBlockData?: SolanaPreFetchData, feeRate?: string): Promise<SignatureData> {
        return this.Init.signSwapInitialization(signer, swapData, authorizationTimeout, preFetchedBlockData, feeRate);
    }

    /**
     * @inheritDoc
     */
    isValidInitAuthorization(signer: string, swapData: SolanaSwapData, sig: SignatureData, feeRate?: string, preFetchedData?: SolanaPreFetchVerification): Promise<Buffer> {
        return this.Init.isSignatureValid(new PublicKey(signer), swapData, sig.timeout, sig.prefix, sig.signature, feeRate, preFetchedData);
    }

    /**
     * @inheritDoc
     */
    getInitAuthorizationExpiry(swapData: SolanaSwapData, sig: SignatureData, preFetchedData?: SolanaPreFetchVerification): Promise<number> {
        return this.Init.getSignatureExpiry(sig.timeout, sig.signature, preFetchedData);
    }

    /**
     * @inheritDoc
     */
    isInitAuthorizationExpired(swapData: SolanaSwapData, sig: SignatureData): Promise<boolean> {
        return this.Init.isSignatureExpired(sig.signature, sig.timeout);
    }

    /**
     * @inheritDoc
     */
    getRefundSignature(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number): Promise<SignatureData> {
        return this.Refund.signSwapRefund(signer, swapData, authorizationTimeout);
    }

    /**
     * @inheritDoc
     */
    isValidRefundAuthorization(swapData: SolanaSwapData, sig: SignatureData): Promise<Buffer> {
        return this.Refund.isSignatureValid(swapData, sig.timeout, sig.prefix, sig.signature);
    }

    /**
     * @inheritDoc
     */
    getDataSignature(signer: SolanaSigner, data: Buffer): Promise<string> {
        return this._Chain.Signatures.getDataSignature(signer, data);
    }

    /**
     * @inheritDoc
     */
    isValidDataSignature(data: Buffer, signature: string, publicKey: string): Promise<boolean> {
        return this._Chain.Signatures.isValidDataSignature(data, signature, publicKey);
    }

    ////////////////////////////////////////////
    //// Swap data utils
    /**
     * @inheritDoc
     */
    async isClaimable(signer: string, data: SolanaSwapData): Promise<boolean> {
        if(!data.isClaimer(signer)) return false;
        if(await this.isExpired(signer, data)) return false;
        return await this.isCommited(data);
    }

    /**
     * @inheritDoc
     */
    async isCommited(swapData: SolanaSwapData): Promise<boolean> {
        const paymentHash = Buffer.from(swapData.paymentHash, "hex");

        const account = await this.program.account.escrowState.fetchNullable(this._SwapEscrowState(paymentHash));
        if(account==null) return false;

        return swapData.correctPDA(account);
    }

    /**
     * @inheritDoc
     */
    isExpired(signer: string, data: SolanaSwapData, refundSide?: boolean): Promise<boolean> {
        let currentTimestamp: BN = new BN(Math.floor(Date.now()/1000));
        if(data.isClaimer(signer) && !refundSide) {
            currentTimestamp = currentTimestamp.add(new BN(this.claimGracePeriod));
        } else {
            currentTimestamp = currentTimestamp.sub(new BN(this.refundGracePeriod));
        }
        return Promise.resolve(data.expiry.lt(currentTimestamp));
    }

    /**
     * @inheritDoc
     */
    async isRequestRefundable(signer: string, data: SolanaSwapData): Promise<boolean> {
        //V1 Swap can only be refunded by the offerer
        if(isSwapProgramV1(this.program) && !data.isOfferer(signer)) return false;
        if(!(await this.isExpired(signer, data, true))) return false;
        return await this.isCommited(data);
    }

    /**
     * @inheritDoc
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

    /**
     * @inheritDoc
     */
    getHashForHtlc(swapHash: Buffer): Buffer {
        return Buffer.from(toClaimHash(
            swapHash.toString("hex"),
            0n,
            0
        ), "hex");
    }

    /**
     * @inheritDoc
     */
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
     * @inheritDoc
     */
    async getCommitStatus(signer: string, data: SolanaSwapData): Promise<SwapCommitState> {
        const escrowStateKey = this._SwapEscrowState(Buffer.from(data.paymentHash, "hex"));
        const [escrowState, isExpired] = await Promise.all([
            this.program.account.escrowState.fetchNullable(escrowStateKey) as Promise<IdlAccounts<SwapProgram | SwapProgramV2>["escrowState"]>,
            this.isExpired(signer,data)
        ]);

        const getInitTxId = onceAsync(async () => {
            const txId = await this._Events.findInEvents(escrowStateKey, async (event, tx) => {
                if (event.name === "InitializeEvent") {
                    const paymentHash = Buffer.from(event.data.hash).toString("hex");
                    if(paymentHash!==data.paymentHash) return null;
                    if(!event.data.sequence.eq(data.sequence)) return null;
                    return tx.transaction.signatures[0];
                }
            });
            if(txId==null) throw new Error("Initialize event not found!");
            return txId;
        });

        if(escrowState!=null) {
            if(data.correctPDA(escrowState)) {
                if(data.isOfferer(signer) && isExpired) return {type: SwapCommitStateType.REFUNDABLE, getInitTxId};
                return {type: SwapCommitStateType.COMMITED, getInitTxId};
            }

            if(data.isOfferer(signer) && isExpired) return {type: SwapCommitStateType.EXPIRED};
            return {type: SwapCommitStateType.NOT_COMMITED};
        }

        //Check if paid or what
        const status: SwapNotCommitedState | SwapExpiredState | SwapPaidState | null = await this._Events.findInEvents(escrowStateKey, async (event, tx) => {
            if(event.name==="ClaimEvent") {
                const paymentHash = Buffer.from(event.data.hash).toString("hex");
                if(paymentHash!==data.paymentHash) return null;
                if(!event.data.sequence.eq(data.sequence)) return null;
                return {
                    type: SwapCommitStateType.PAID,
                    getInitTxId,
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
                    getInitTxId,
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

    /**
     * @inheritDoc
     */
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
     * @inheritDoc
     */
    async getClaimHashStatus(claimHash: string): Promise<SwapCommitStateType> {
        const {paymentHash} = fromClaimHash(claimHash);
        const escrowStateKey = this._SwapEscrowState(Buffer.from(paymentHash, "hex"));
        const abortController = new AbortController();

        //Start fetching events before checking escrow PDA, this call is used when quoting, so saving 100ms here helps a lot!
        const eventsPromise = this._Events.findInEvents(escrowStateKey, async (event) => {
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
     * @inheritDoc
     */
    async getCommitedData(claimHashHex: string): Promise<SolanaSwapData | null> {
        const {paymentHash} = fromClaimHash(claimHashHex);
        const paymentHashBuffer = Buffer.from(paymentHash, "hex");

        const account: IdlAccounts<SwapProgram | SwapProgramV2>["escrowState"] | null =
            await this.program.account.escrowState.fetchNullable(
                this._SwapEscrowState(paymentHashBuffer)
            );
        if(account==null) return null;

        return SolanaSwapData.fromEscrowState(this.program.programId, this.version, account);
    }

    /**
     * @inheritDoc
     */
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

        await this._Events.findInEvents(new PublicKey(signer), async (event, tx) => {
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
                const instructions = this._Events.decodeInstructions(tx.transaction.message);
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
                    data: SolanaSwapData.fromInstruction(this.program.programId, this.version, initIx, txoHash),
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
                        getInitTxId: foundSwapData?.getInitTxId,
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
                        getInitTxId: foundSwapData?.getInitTxId,
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
                  ? {type: SwapCommitStateType.REFUNDABLE, getInitTxId: foundSwapData.getInitTxId}
                  : {type: SwapCommitStateType.COMMITED, getInitTxId: foundSwapData.getInitTxId}
            }
        }

        return {
            swaps: resultingSwaps,
            latestBlockheight: latestBlockheight ?? startBlockheight
        }
    }

    ////////////////////////////////////////////
    //// Swap data initializer
    /**
     * @inheritDoc
     */
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
            programId: this.program.programId,
            version: this.version,
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
    /**
     * @inheritDoc
     */
    async getBalance(signer: string, tokenAddress: string, inContract: boolean): Promise<bigint> {
        if(!inContract) {
            return await this._Chain.getBalance(signer, tokenAddress);
        }

        const token = new PublicKey(tokenAddress);
        const publicKey = new PublicKey(signer);

        return await this.getIntermediaryBalance(publicKey, token);
    }

    /**
     * @inheritDoc
     */
    getIntermediaryData(address: string, token: string): Promise<{
        balance: bigint,
        reputation: IntermediaryReputationType
    } | null> {
        return this.LpVault.getIntermediaryData(new PublicKey(address), new PublicKey(token));
    }

    /**
     * @inheritDoc
     */
    getIntermediaryReputation(address: string, token: string): Promise<IntermediaryReputationType | null> {
        return this.LpVault.getIntermediaryReputation(new PublicKey(address), new PublicKey(token));
    }

    /**
     * Returns intermediary vault balance for a specific token.
     *
     * @param address Intermediary address
     * @param token Token mint
     */
    getIntermediaryBalance(address: PublicKey, token: PublicKey): Promise<bigint> {
        return this.LpVault.getIntermediaryBalance(address, token);
    }

    ////////////////////////////////////////////
    //// Transaction initializers
    /**
     * @inheritDoc
     */
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

    /**
     * @inheritDoc
     */
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

    /**
     * @inheritDoc
     */
    txsRefund(signer: string, swapData: SolanaSwapData, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]> {
        return this.Refund.txsRefund(new PublicKey(signer), swapData, check, initAta, feeRate);
    }

    /**
     * @inheritDoc
     */
    txsRefundWithAuthorization(signer: string, swapData: SolanaSwapData, sig: SignatureData, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]> {
        return this.Refund.txsRefundWithAuthorization(new PublicKey(signer), swapData, sig.timeout, sig.prefix, sig.signature,check,initAta, feeRate);
    }

    /**
     * @inheritDoc
     */
    txsInit(sender: string, swapData: SolanaSwapData, sig: SignatureData, skipChecks?: boolean, feeRate?: string): Promise<SolanaTx[]> {
        if(swapData.isPayIn()) {
            return this.Init.txsInitPayIn(new PublicKey(sender), swapData, sig.timeout, sig.prefix, sig.signature, skipChecks, feeRate);
        } else {
            return this.Init.txsInit(new PublicKey(sender), swapData, sig.timeout, sig.prefix, sig.signature, skipChecks, feeRate);
        }
    }

    /**
     * @inheritDoc
     */
    txsWithdraw(signer: string, token: string, amount: bigint, feeRate?: string): Promise<SolanaTx[]> {
        return this.LpVault.txsWithdraw(new PublicKey(signer), new PublicKey(token), amount, feeRate);
    }

    /**
     * @inheritDoc
     */
    txsDeposit(signer: string, token: string, amount: bigint, feeRate?: string): Promise<SolanaTx[]> {
        return this.LpVault.txsDeposit(new PublicKey(signer), new PublicKey(token), amount, feeRate);
    }

    ////////////////////////////////////////////
    //// Executors
    /**
     * @inheritDoc
     */
    async claimWithSecret(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        secret: string,
        checkExpiry?: boolean,
        initAta?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        const result = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, checkExpiry, initAta, txOptions?.feeRate);
        const [signature] = await this._Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return signature;
    }

    /**
     * @inheritDoc
     */
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

        const signatures = await this._Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal);
        await this._DataAccount.removeDataAccount(storageAcc);

        return signatures[claimTxIndex] ?? signatures[0];
    }

    /**
     * @inheritDoc
     */
    async refund(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        check?: boolean,
        initAta?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        let result = await this.txsRefund(signer.getAddress(), swapData, check, initAta, txOptions?.feeRate);

        const [signature] = await this._Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);

        return signature;
    }

    /**
     * @inheritDoc
     */
    async refundWithAuthorization(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        signature: SignatureData,
        check?: boolean,
        initAta?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        let result = await this.txsRefundWithAuthorization(signer.getAddress(), swapData, signature, check, initAta, txOptions?.feeRate);

        const [txSignature] = await this._Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);

        return txSignature;
    }

    /**
     * @inheritDoc
     */
    async init(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        signature: SignatureData,
        skipChecks?: boolean,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        const result = await this.txsInit(signer.getAddress(), swapData, signature, skipChecks, txOptions?.feeRate);

        const signatures = await this._Chain.sendAndConfirm(signer, result, txOptions?.waitForConfirmation, txOptions?.abortSignal);

        return signatures[signatures.length-1];
    }

    /**
     * @inheritDoc
     */
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
        let txsClaim: SolanaTx[];
        if(isSwapProgramV1(this.program)) {
            // In V1 the initialize instruction has to contain the ATA initialization, hence we can skip checking it in claim
            txsClaim = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, true, false, txOptions?.feeRate, true);
        } else {
            // In V2 the initialize instruction doesn't necessarily contain the ATA initialization, hence the claim instruction needs to
            //  check and initialize the ATA if needed
            txsClaim = await this.Claim.txsClaimWithSecret(signer.getPublicKey(), swapData, secret, true, true, txOptions?.feeRate, false);
        }

        const signatures = await this._Chain.sendAndConfirm(signer, txsCommit.concat(txsClaim), txOptions?.waitForConfirmation, txOptions?.abortSignal);
        return [signatures[txsCommit.length-1], signatures[signatures.length-1]]
    }

    /**
     * @inheritDoc
     */
    async withdraw(
        signer: SolanaSigner,
        token: string,
        amount: bigint,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        const txs = await this.LpVault.txsWithdraw(signer.getPublicKey(), new PublicKey(token), amount, txOptions?.feeRate);
        const [txId] = await this._Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }

    /**
     * @inheritDoc
     */
    async deposit(
        signer: SolanaSigner,
        token: string,
        amount: bigint,
        txOptions?: TransactionConfirmationOptions
    ): Promise<string> {
        const txs = await this.LpVault.txsDeposit(signer.getPublicKey(), new PublicKey(token), amount, txOptions?.feeRate);
        const [txId] = await this._Chain.sendAndConfirm(signer, txs, txOptions?.waitForConfirmation, txOptions?.abortSignal, false);
        return txId;
    }

    ////////////////////////////////////////////
    //// Fees
    /**
     * @inheritDoc
     */
    getInitPayInFeeRate(offerer?: string, claimer?: string, token?: string, claimHash?: string): Promise<string> {
        const paymentHash = claimHash==null ? undefined : fromClaimHash(claimHash).paymentHash;
        return this.Init.getInitPayInFeeRate(
            toPublicKeyOrNull(offerer),
            toPublicKeyOrNull(claimer),
            toPublicKeyOrNull(token),
            paymentHash
        );
    }

    /**
     * @inheritDoc
     */
    getInitFeeRate(offerer?: string, claimer?: string, token?: string, claimHash?: string): Promise<string> {
        const paymentHash = claimHash==null ? undefined : fromClaimHash(claimHash).paymentHash;
        return this.Init.getInitFeeRate(
            toPublicKeyOrNull(offerer),
            toPublicKeyOrNull(claimer),
            toPublicKeyOrNull(token),
            paymentHash
        );
    }

    /**
     * @inheritDoc
     */
    getRefundFeeRate(swapData: SolanaSwapData): Promise<string> {
        return this.Refund.getRefundFeeRate(swapData);
    }

    /**
     * @inheritDoc
     */
    getClaimFeeRate(signer: string, swapData: SolanaSwapData): Promise<string> {
        return this.Claim.getClaimFeeRate(new PublicKey(signer), swapData);
    }

    /**
     * @inheritDoc
     */
    getClaimFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Claim.getClaimFee(new PublicKey(signer), swapData, feeRate);
    }

    /**
     * @inheritDoc
     */
    getRawClaimFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Claim.getRawClaimFee(new PublicKey(signer), swapData, feeRate);
    }

    /**
     * @inheritDoc
     */
    getCommitFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Init.getInitFee(swapData, feeRate);
    }

    /**
     * @inheritDoc
     */
    getRawCommitFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Init.getRawInitFee(swapData, feeRate);
    }

    /**
     * @inheritDoc
     */
    getRefundFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Refund.getRefundFee(swapData, feeRate);
    }

    /**
     * @inheritDoc
     */
    getRawRefundFee(signer: string, swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return this.Refund.getRawRefundFee(swapData, feeRate);
    }

    /**
     * @inheritDoc
     */
    getExtraData(outputScript: Buffer, amount: bigint, confirmations: number, nonce?: bigint): Buffer {
        return Buffer.from(sha256(Buffer.concat([
            BigIntBufferUtils.toBuffer(amount, "le", 8),
            outputScript
        ])));
    }

}
