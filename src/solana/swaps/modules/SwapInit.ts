import {ParsedAccountsModeBlockResponse, PublicKey, SystemProgram, Transaction} from "@solana/web3.js";
import {SignatureVerificationError, SwapCommitStatus, SwapDataVerificationError} from "@atomiqlabs/base";
import {SolanaSwapData} from "../SolanaSwapData";
import {SolanaAction} from "../../chain/SolanaAction";
import {
    Account,
    createAssociatedTokenAccountIdempotentInstruction,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {SolanaSwapModule} from "../SolanaSwapModule";
import {SolanaTx} from "../../chain/modules/SolanaTransactions";
import {toBN, tryWithRetries} from "../../../utils/Utils";
import {Buffer} from "buffer";
import {SolanaSigner} from "../../wallet/SolanaSigner";
import {SolanaTokens} from "../../chain/modules/SolanaTokens";

export type SolanaPreFetchVerification = {
    latestSlot?: {
        slot: number,
        timestamp: number
    },
    transactionSlot?: {
        slot: number,
        blockhash: string
    }
};

export type SolanaPreFetchData = {
    block: ParsedAccountsModeBlockResponse,
    slot: number,
    timestamp: number
}

export class SwapInit extends SolanaSwapModule {

    public readonly SIGNATURE_SLOT_BUFFER = 20;
    public readonly SIGNATURE_PREFETCH_DATA_VALIDITY = 5000;

    private static readonly CUCosts = {
        INIT: 90000,
        INIT_PAY_IN: 50000,
    };

    /**
     * bare Init action based on the data passed in swapData
     *
     * @param swapData
     * @param timeout
     * @private
     */
    private async Init(swapData: SolanaSwapData, timeout: bigint): Promise<SolanaAction> {
        const claimerAta = getAssociatedTokenAddressSync(swapData.token, swapData.claimer);
        const paymentHash = Buffer.from(swapData.paymentHash, "hex");
        const accounts = {
            claimer: swapData.claimer,
            offerer: swapData.offerer,
            escrowState: this.program.SwapEscrowState(paymentHash),
            mint: swapData.token,
            systemProgram: SystemProgram.programId,
            claimerAta: swapData.payOut ? claimerAta : null,
            claimerUserData: !swapData.payOut ? this.program.SwapUserVault(swapData.claimer, swapData.token) : null
        };

        if(swapData.payIn) {
            const ata = getAssociatedTokenAddressSync(swapData.token, swapData.offerer);

            return new SolanaAction(swapData.offerer, this.root,
                await this.swapProgram.methods
                    .offererInitializePayIn(
                        swapData.toSwapDataStruct(),
                        [...Buffer.alloc(32, 0)],
                        toBN(timeout),
                    )
                    .accounts({
                        ...accounts,
                        offererAta: ata,
                        vault: this.program.SwapVault(swapData.token),
                        vaultAuthority: this.program.SwapVaultAuthority,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction(),
                SwapInit.CUCosts.INIT_PAY_IN
            );
        } else {
            return new SolanaAction(swapData.claimer, this.root,
                await this.swapProgram.methods
                    .offererInitialize(
                        swapData.toSwapDataStruct(),
                        swapData.securityDeposit,
                        swapData.claimerBounty,
                        [...(swapData.txoHash!=null ? Buffer.from(swapData.txoHash, "hex") : Buffer.alloc(32, 0))],
                        toBN(timeout)
                    )
                    .accounts({
                        ...accounts,
                        offererUserData: this.program.SwapUserVault(swapData.offerer, swapData.token),
                    })
                    .instruction(),
                SwapInit.CUCosts.INIT
            );
        }
    }

    /**
     * InitPayIn action which includes SOL to WSOL wrapping if indicated by the fee rate
     *
     * @param swapData
     * @param timeout
     * @param feeRate
     * @constructor
     * @private
     */
    private async InitPayIn(swapData: SolanaSwapData, timeout: bigint, feeRate: string): Promise<SolanaAction> {
        if(!swapData.isPayIn()) throw new Error("Must be payIn==true");
        const action = new SolanaAction(swapData.offerer, this.root);
        if(this.shouldWrapOnInit(swapData, feeRate)) action.addAction(this.Wrap(swapData, feeRate));
        action.addAction(await this.Init(swapData, timeout));
        return action;
    }

    /**
     * InitNotPayIn action with additional createAssociatedTokenAccountIdempotentInstruction instruction, such that
     *  a recipient ATA is created if it doesn't exist
     *
     * @param swapData
     * @param timeout
     * @constructor
     * @private
     */
    private async InitNotPayIn(swapData: SolanaSwapData, timeout: bigint): Promise<SolanaAction> {
        if(swapData.isPayIn()) throw new Error("Must be payIn==false");
        const action = new SolanaAction(swapData.claimer, this.root);
        action.addIx(
            createAssociatedTokenAccountIdempotentInstruction(
                swapData.claimer,
                swapData.claimerAta,
                swapData.claimer,
                swapData.token
            )
        );
        action.addAction(await this.Init(swapData, timeout));
        return action;
    }

    private Wrap(
        swapData: SolanaSwapData,
        feeRate: string
    ): SolanaAction {
        const data = this.extractAtaDataFromFeeRate(feeRate);
        if(data==null) throw new Error("Tried to add wrap instruction, but feeRate malformed: "+feeRate);
        return this.root.Tokens.Wrap(swapData.offerer, swapData.getAmount() - data.balance, data.initAta);
    }

    /**
     * Extracts data about SOL to WSOL wrapping from the fee rate, fee rate is used to convey this information from
     *  the user to the intermediary, such that the intermediary creates valid signature for transaction including
     *  the SOL to WSOL wrapping instructions
     *
     * @param feeRate
     * @private
     */
    private extractAtaDataFromFeeRate(feeRate: string): {balance: bigint, initAta: boolean} | null {
        const hashArr = feeRate==null ? [] : feeRate.split("#");
        if(hashArr.length<=1) return null;

        const arr = hashArr[1].split(";");
        if(arr.length<=1) return null;

        return {
            balance: BigInt(arr[1]),
            initAta: arr[0]==="1"
        }
    }

    /**
     * Checks whether a wrap instruction (SOL -> WSOL) should be a part of the signed init message
     *
     * @param swapData
     * @param feeRate
     * @private
     * @returns {boolean} returns true if wrap instruction should be added
     */
    private shouldWrapOnInit(swapData: SolanaSwapData, feeRate: string): boolean {
        const data = this.extractAtaDataFromFeeRate(feeRate);
        if(data==null) return false;
        return data.balance < swapData.getAmount();
    }

    /**
     * Returns the transaction to be signed as an initialization signature from the intermediary, also adds
     *  SOL to WSOL wrapping if indicated by the fee rate
     *
     * @param swapData
     * @param timeout
     * @param feeRate
     * @private
     */
    private async getTxToSign(swapData: SolanaSwapData, timeout: string, feeRate?: string): Promise<Transaction> {
        const action = swapData.isPayIn() ?
            await this.InitPayIn(swapData, BigInt(timeout), feeRate) :
            await this.InitNotPayIn(swapData, BigInt(timeout));

        const tx = (await action.tx(feeRate)).tx;
        return tx;
    }

    /**
     * Returns auth prefix to be used with a specific swap, payIn=true & payIn=false use different prefixes (these
     *  actually have no meaning for the smart contract/solana program in the Solana case)
     *
     * @param swapData
     * @private
     */
    private getAuthPrefix(swapData: SolanaSwapData): string {
        return swapData.isPayIn() ? "claim_initialize" : "initialize";
    }

    /**
     * Returns "processed" slot required for signature validation, uses preFetchedData if provided & valid
     *
     * @param preFetchedData
     * @private
     */
    private getSlotForSignature(preFetchedData?: SolanaPreFetchVerification): Promise<number> {
        if(
            preFetchedData!=null &&
            preFetchedData.latestSlot!=null &&
            preFetchedData.latestSlot.timestamp>Date.now()-this.root.Slots.SLOT_CACHE_TIME
        ) {
            const estimatedSlotsPassed = Math.floor((Date.now()-preFetchedData.latestSlot.timestamp)/this.root.SLOT_TIME);
            const estimatedCurrentSlot = preFetchedData.latestSlot.slot+estimatedSlotsPassed;
            this.logger.debug("getSlotForSignature(): slot: "+preFetchedData.latestSlot.slot+
                " estimated passed slots: "+estimatedSlotsPassed+" estimated current slot: "+estimatedCurrentSlot);
            return Promise.resolve(estimatedCurrentSlot);
        }
        return this.root.Slots.getSlot("processed");
    }

    /**
     * Returns blockhash required for signature validation, uses preFetchedData if provided & valid
     *
     * @param txSlot
     * @param preFetchedData
     * @private
     */
    private getBlockhashForSignature(txSlot: number, preFetchedData?: SolanaPreFetchVerification): Promise<string> {
        if(
            preFetchedData!=null &&
            preFetchedData.transactionSlot!=null &&
            preFetchedData.transactionSlot.slot===txSlot
        ) {
            return Promise.resolve(preFetchedData.transactionSlot.blockhash);
        }
        return this.root.Blocks.getParsedBlock(txSlot).then(val => val.blockhash);
    }

    /**
     * Pre-fetches slot & block based on priorly received SolanaPreFetchData, such that it can later be used
     *  by signature verification
     *
     * @param data
     */
    public async preFetchForInitSignatureVerification(data: SolanaPreFetchData): Promise<SolanaPreFetchVerification> {
        const [latestSlot, txBlock] = await Promise.all([
            this.root.Slots.getSlotAndTimestamp("processed"),
            this.root.Blocks.getParsedBlock(data.slot)
        ]);
        return {
            latestSlot,
            transactionSlot: {
                slot: data.slot,
                blockhash: txBlock.blockhash
            }
        }
    }

    /**
     * Pre-fetches block data required for signing the init message by the LP, this can happen in parallel before
     *  signing takes place making the quoting quicker
     */
    public async preFetchBlockDataForSignatures(): Promise<SolanaPreFetchData> {
        const latestParsedBlock = await this.root.Blocks.findLatestParsedBlock("finalized");
        return {
            block: latestParsedBlock.block,
            slot: latestParsedBlock.slot,
            timestamp: Date.now()
        };
    }

    /**
     * Signs swap initialization authorization, using data from preFetchedBlockData if provided & still valid (subject
     *  to SIGNATURE_PREFETCH_DATA_VALIDITY)
     *
     * @param signer
     * @param swapData
     * @param authorizationTimeout
     * @param feeRate
     * @param preFetchedBlockData
     * @public
     */
    public async signSwapInitialization(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        authorizationTimeout: number,
        preFetchedBlockData?: SolanaPreFetchData,
        feeRate?: string
    ): Promise<{prefix: string, timeout: string, signature: string}> {
        if(signer.keypair==null) throw new Error("Unsupported");
        if(!signer.getPublicKey().equals(swapData.isPayIn() ? swapData.claimer : swapData.offerer)) throw new Error("Invalid signer, wrong public key!");

        if(preFetchedBlockData!=null && Date.now()-preFetchedBlockData.timestamp>this.SIGNATURE_PREFETCH_DATA_VALIDITY) preFetchedBlockData = null;

        const {
            block: latestBlock,
            slot: latestSlot
        } = preFetchedBlockData || await this.root.Blocks.findLatestParsedBlock("finalized");

        const authTimeout = Math.floor(Date.now()/1000)+authorizationTimeout;
        const txToSign = await this.getTxToSign(swapData, authTimeout.toString(10), feeRate);
        txToSign.feePayer = swapData.isPayIn() ? swapData.offerer : swapData.claimer;
        txToSign.recentBlockhash = latestBlock.blockhash;
        txToSign.sign(signer.keypair);
        this.logger.debug("signSwapInitialization(): Signed tx: ",txToSign);

        const sig = txToSign.signatures.find(e => e.publicKey.equals(signer.getPublicKey()));

        return {
            prefix: this.getAuthPrefix(swapData),
            timeout: authTimeout.toString(10),
            signature: latestSlot+";"+sig.signature.toString("hex")
        };
    }

    /**
     * Checks whether the provided signature data is valid, using preFetchedData if provided and still valid
     *
     * @param swapData
     * @param timeout
     * @param prefix
     * @param signature
     * @param feeRate
     * @param preFetchedData
     * @public
     */
    public async isSignatureValid(
        swapData: SolanaSwapData,
        timeout: string,
        prefix: string,
        signature: string,
        feeRate?: string,
        preFetchedData?: SolanaPreFetchVerification
    ): Promise<Buffer> {
        const sender = swapData.isPayIn() ? swapData.offerer : swapData.claimer;
        const signer = swapData.isPayIn() ? swapData.claimer : swapData.offerer;

        if(!swapData.isPayIn() && await this.program.isExpired(sender.toString(), swapData)) {
            throw new SignatureVerificationError("Swap will expire too soon!");
        }

        if(prefix!==this.getAuthPrefix(swapData)) throw new SignatureVerificationError("Invalid prefix");

        const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
        const isExpired = (BigInt(timeout) - currentTimestamp) < BigInt(this.program.authGracePeriod);
        if (isExpired) throw new SignatureVerificationError("Authorization expired!");

        const [transactionSlot, signatureString] = signature.split(";");
        const txSlot = parseInt(transactionSlot);

        const [latestSlot, blockhash] = await Promise.all([
            this.getSlotForSignature(preFetchedData),
            this.getBlockhashForSignature(txSlot, preFetchedData)
        ]);

        const lastValidTransactionSlot = txSlot+this.root.TX_SLOT_VALIDITY;
        const slotsLeft = lastValidTransactionSlot-latestSlot-this.SIGNATURE_SLOT_BUFFER;
        if(slotsLeft<0) throw new SignatureVerificationError("Authorization expired!");

        const txToSign = await this.getTxToSign(swapData, timeout, feeRate);
        txToSign.feePayer = sender;
        txToSign.recentBlockhash = blockhash;
        txToSign.addSignature(signer, Buffer.from(signatureString, "hex"));
        this.logger.debug("isSignatureValid(): Signed tx: ",txToSign);

        const valid = txToSign.verifySignatures(false);

        if(!valid) throw new SignatureVerificationError("Invalid signature!");

        return Buffer.from(blockhash);
    }

    /**
     * Gets expiry of the provided signature data, this is a minimum of slot expiry & swap signature expiry
     *
     * @param timeout
     * @param signature
     * @param preFetchedData
     * @public
     */
    public async getSignatureExpiry(
        timeout: string,
        signature: string,
        preFetchedData?: SolanaPreFetchVerification
    ): Promise<number> {
        const [transactionSlotStr, signatureString] = signature.split(";");
        const txSlot = parseInt(transactionSlotStr);

        const latestSlot = await this.getSlotForSignature(preFetchedData);
        const lastValidTransactionSlot = txSlot+this.root.TX_SLOT_VALIDITY;
        const slotsLeft = lastValidTransactionSlot-latestSlot-this.SIGNATURE_SLOT_BUFFER;

        const now = Date.now();

        const slotExpiryTime = now + (slotsLeft*this.root.SLOT_TIME);
        const timeoutExpiryTime = (parseInt(timeout)-this.program.authGracePeriod)*1000;
        const expiry = Math.min(slotExpiryTime, timeoutExpiryTime);

        if(expiry<now) return 0;

        return expiry;
    }

    /**
     * Checks whether signature is expired for good (uses "finalized" slot)
     *
     * @param signature
     * @param timeout
     * @public
     */
    public async isSignatureExpired(
        signature: string,
        timeout: string
    ): Promise<boolean> {
        const [transactionSlotStr, signatureString] = signature.split(";");
        const txSlot = parseInt(transactionSlotStr);

        const lastValidTransactionSlot = txSlot+this.root.TX_SLOT_VALIDITY;
        const latestSlot = await this.root.Slots.getSlot("finalized");
        const slotsLeft = lastValidTransactionSlot-latestSlot+this.SIGNATURE_SLOT_BUFFER;

        if(slotsLeft<0) return true;
        if((parseInt(timeout)+this.program.authGracePeriod)*1000 < Date.now()) return true;
        return false;
    }

    /**
     * Creates init transaction (InitPayIn) with a valid signature from an LP, also adds a SOL to WSOL wrapping ix to
     *  the init transaction (if indicated by the fee rate) or adds the wrapping in a separate transaction (if no
     *  indication in the fee rate)
     *
     * @param swapData swap to initialize
     * @param timeout init signature timeout
     * @param prefix init signature prefix
     * @param signature init signature
     * @param skipChecks whether to skip signature validity checks
     * @param feeRate fee rate to use for the transaction
     */
    public async txsInitPayIn(
        swapData: SolanaSwapData,
        timeout: string,
        prefix: string,
        signature: string,
        skipChecks?: boolean,
        feeRate?: string
    ): Promise<SolanaTx[]> {
        if(!skipChecks) {
            const [_, payStatus] = await Promise.all([
                tryWithRetries(
                    () => this.isSignatureValid(swapData, timeout, prefix, signature, feeRate),
                    this.retryPolicy, (e) => e instanceof SignatureVerificationError
                ),
                tryWithRetries(() => this.program.getClaimHashStatus(swapData.getClaimHash()), this.retryPolicy)
            ]);
            if(payStatus!==SwapCommitStatus.NOT_COMMITED) throw new SwapDataVerificationError("Invoice already being paid for or paid");
        }

        const [slotNumber, signatureStr] = signature.split(";");
        const block = await tryWithRetries(
            () => this.root.Blocks.getParsedBlock(parseInt(slotNumber)),
            this.retryPolicy
        );

        const txs: SolanaTx[] = [];

        let isWrapping: boolean = false;
        const isWrappedInSignedTx = feeRate!=null && feeRate.split("#").length>1;
        if(!isWrappedInSignedTx && swapData.token.equals(SolanaTokens.WSOL_ADDRESS)) {
            const ataAcc = await tryWithRetries<Account>(
                () => this.root.Tokens.getATAOrNull(swapData.offererAta),
                this.retryPolicy
            );
            const balance: bigint = ataAcc==null ? 0n : ataAcc.amount;

            if(balance < swapData.getAmount()) {
                //Need to wrap more SOL to WSOL
                await this.root.Tokens.Wrap(swapData.offerer, swapData.getAmount() - balance, ataAcc==null)
                    .addToTxs(txs, feeRate, block);
                isWrapping = true;
            }
        }

        const initTx = await (await this.InitPayIn(swapData, BigInt(timeout), feeRate)).tx(feeRate, block);
        initTx.tx.addSignature(swapData.claimer, Buffer.from(signatureStr, "hex"));
        txs.push(initTx);

        this.logger.debug("txsInitPayIn(): create swap init TX, swap: "+swapData.getClaimHash()+
            " wrapping client-side: "+isWrapping+" feerate: "+feeRate);

        return txs;
    }

    /**
     * Creates init transactions (InitNotPayIn) with a valid signature from an intermediary
     *
     * @param swapData swap to initialize
     * @param timeout init signature timeout
     * @param prefix init signature prefix
     * @param signature init signature
     * @param skipChecks whether to skip signature validity checks
     * @param feeRate fee rate to use for the transaction
     */
    public async txsInit(swapData: SolanaSwapData, timeout: string, prefix: string, signature: string, skipChecks?: boolean, feeRate?: string): Promise<SolanaTx[]> {
        if(!skipChecks) {
            await tryWithRetries(
                () => this.isSignatureValid(swapData, timeout, prefix, signature, feeRate),
                this.retryPolicy,
                (e) => e instanceof SignatureVerificationError
            );
        }

        const [slotNumber, signatureStr] = signature.split(";");
        const block = await tryWithRetries(
            () => this.root.Blocks.getParsedBlock(parseInt(slotNumber)),
            this.retryPolicy
        );

        const initTx = await (await this.InitNotPayIn(swapData, BigInt(timeout))).tx(feeRate, block);
        initTx.tx.addSignature(swapData.offerer, Buffer.from(signatureStr, "hex"));

        this.logger.debug("txsInit(): create swap init TX, swap: "+swapData.getClaimHash()+" feerate: "+feeRate);

        return [initTx];
    }

    /**
     * Returns the fee rate to be used for a specific init transaction, also adding indication whether the WSOL ATA
     *  should be initialized in the init transaction and/or current balance in the WSOL ATA
     *
     * @param offerer
     * @param claimer
     * @param token
     * @param paymentHash
     */
    public async getInitPayInFeeRate(offerer?: PublicKey, claimer?: PublicKey, token?: PublicKey, paymentHash?: string): Promise<string> {
        const accounts: PublicKey[] = [];

        if (offerer != null) accounts.push(offerer);
        if (token != null) {
            accounts.push(this.program.SwapVault(token));
            if (offerer != null) accounts.push(getAssociatedTokenAddressSync(token, offerer));
            if (claimer != null) accounts.push(this.program.SwapUserVault(claimer, token));
        }
        if (paymentHash != null) accounts.push(this.program.SwapEscrowState(Buffer.from(paymentHash, "hex")));

        const shouldCheckWSOLAta = token != null && offerer != null && token.equals(SolanaTokens.WSOL_ADDRESS);
        let [feeRate, _account] = await Promise.all([
            this.root.Fees.getFeeRate(accounts),
            shouldCheckWSOLAta ?
                this.root.Tokens.getATAOrNull(getAssociatedTokenAddressSync(token, offerer)) :
                Promise.resolve(null)
        ]);

        if(shouldCheckWSOLAta) {
            const account: Account = _account;
            const balance: bigint = account == null ? 0n : account.amount;
            //Add an indication about whether the ATA is initialized & balance it contains
            feeRate += "#" + (account != null ? "0" : "1") + ";" + balance.toString(10);
        }

        this.logger.debug("getInitPayInFeeRate(): feerate computed: "+feeRate);
        return feeRate;
    }

    /**
     * Returns the fee rate to be used for a specific init transaction
     *
     * @param offerer
     * @param claimer
     * @param token
     * @param paymentHash
     */
    public getInitFeeRate(offerer?: PublicKey, claimer?: PublicKey, token?: PublicKey, paymentHash?: string): Promise<string> {
        const accounts: PublicKey[] = [];

        if(offerer!=null && token!=null) accounts.push(this.program.SwapUserVault(offerer, token));
        if(claimer!=null) accounts.push(claimer)
        if(paymentHash!=null) accounts.push(this.program.SwapEscrowState(Buffer.from(paymentHash, "hex")));

        return this.root.Fees.getFeeRate(accounts);
    }

    /**
     * Get the estimated solana fee of the init transaction, this includes the required deposit for creating swap PDA
     *  and also deposit for ATAs
     */
    async getInitFee(swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        if(swapData==null) return BigInt(this.program.ESCROW_STATE_RENT_EXEMPT) + await this.getRawInitFee(swapData, feeRate);

        feeRate = feeRate ||
            (swapData.payIn
                ? await this.getInitPayInFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash)
                : await this.getInitFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash));

        const [rawFee, initAta] = await Promise.all([
            this.getRawInitFee(swapData, feeRate),
            swapData!=null && swapData.payOut ?
                this.root.Tokens.getATAOrNull(getAssociatedTokenAddressSync(swapData.token, swapData.claimer)).then(acc => acc==null) :
                Promise.resolve<null>(null)
        ]);

        let resultingFee = BigInt(this.program.ESCROW_STATE_RENT_EXEMPT) + rawFee;
        if(initAta) resultingFee += BigInt(SolanaTokens.SPL_ATA_RENT_EXEMPT);

        if(swapData.payIn && this.shouldWrapOnInit(swapData, feeRate) && this.extractAtaDataFromFeeRate(feeRate).initAta) {
            resultingFee += BigInt(SolanaTokens.SPL_ATA_RENT_EXEMPT);
        }

        return resultingFee;
    }

    /**
     * Get the estimated solana fee of the init transaction, without the required deposit for creating swap PDA
     */
    async getRawInitFee(swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        if(swapData==null) return 10000n;

        feeRate = feeRate ||
            (swapData.payIn
                ? await this.getInitPayInFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash)
                : await this.getInitFeeRate(swapData.offerer, swapData.claimer, swapData.token, swapData.paymentHash));

        let computeBudget = swapData.payIn ? SwapInit.CUCosts.INIT_PAY_IN : SwapInit.CUCosts.INIT;
        if(swapData.payIn && this.shouldWrapOnInit(swapData, feeRate)) {
            computeBudget += SolanaTokens.CUCosts.WRAP_SOL;
            const data = this.extractAtaDataFromFeeRate(feeRate);
            if(data.initAta) computeBudget += SolanaTokens.CUCosts.ATA_INIT;
        }
        const baseFee = swapData.payIn ? 10000n : 10000n + 5000n;

        return baseFee + this.root.Fees.getPriorityFee(computeBudget, feeRate);
    }

}