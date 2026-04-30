import {
    ParsedAccountsModeBlockResponse,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction
} from "@solana/web3.js";
import {
    SignatureVerificationError,
    SwapCommitStateType,
    SwapDataVerificationError
} from "@atomiqlabs/base";
import {SolanaSwapData} from "../SolanaSwapData";
import {SolanaAction} from "../../chain/SolanaAction";
import {
    Account,
    createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddress,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {SolanaSwapModule} from "../SolanaSwapModule";
import {SolanaTx} from "../../chain/modules/SolanaTransactions";
import {toBN, tryWithRetries} from "../../../utils/Utils";
import {Buffer} from "buffer";
import {SolanaSigner} from "../../wallet/SolanaSigner";
import {SolanaTokens} from "../../chain/modules/SolanaTokens";
import {isSwapProgramV1, isSwapProgramV2} from "../SolanaSwapProgram";
import {BlockChecked} from "../../chain/modules/SolanaBlocks";
import * as BN from "bn.js";

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
     * @param sender
     * @param swapData
     * @param timeout
     * @private
     */
    private async Init(sender: PublicKey, swapData: SolanaSwapData, timeout: bigint): Promise<SolanaAction> {
        const claimerAta = getAssociatedTokenAddressSync(swapData.token, swapData.claimer);
        const paymentHash = Buffer.from(swapData.paymentHash, "hex");
        const accounts = {
            initializer: sender,
            claimer: swapData.claimer,
            offerer: swapData.offerer,
            escrowState: this.program._SwapEscrowState(paymentHash),
            mint: swapData.token,
            systemProgram: SystemProgram.programId,
            claimerAta: swapData.payOut ? claimerAta : null,
            claimerUserData: !swapData.payOut ? this.program._SwapUserVault(swapData.claimer, swapData.token) : null
        };

        if(swapData.payIn) {
            const ata = getAssociatedTokenAddressSync(swapData.token, swapData.offerer);

            let instruction: TransactionInstruction;
            const program = this.swapProgram
            if(isSwapProgramV1(program)) {
                if(!swapData.securityDeposit.eq(new BN(0))) throw new Error("Swap data for V1 payIn=true swaps cannot have any security deposit!");
                if(!swapData.claimerBounty.eq(new BN(0))) throw new Error("Swap data for V1 payIn=true swaps cannot have any claimer bounty!");

                instruction = await program.methods
                    .offererInitializePayIn(
                        swapData.toSwapDataStruct(),
                        [...Buffer.alloc(32, 0)],
                        toBN(timeout),
                    )
                    .accounts({
                        ...accounts,
                        offererAta: ata,
                        vault: this.program._SwapVault(swapData.token),
                        vaultAuthority: this.program._SwapVaultAuthority, // Only necessary for V1 program
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction()
            } else if(isSwapProgramV2(program)) {
                instruction = await program.methods
                    .offererInitializePayIn(
                        swapData.toSwapDataStruct(),
                        swapData.securityDeposit,
                        swapData.claimerBounty,
                        [...(swapData.txoHash!=null ? Buffer.from(swapData.txoHash, "hex") : Buffer.alloc(32, 0))],
                        toBN(timeout)
                    )
                    .accounts({
                        ...accounts,
                        offererAta: ata,
                        vault: this.program._SwapVault(swapData.token),
                        vaultAuthority: this.program._SwapVaultAuthority, // Only necessary for V1 program
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction();

                // Mark the claimer as signer for non payOut swaps
                if(!swapData.isPayOut()) {
                    instruction.keys.forEach(key => {
                        if(key.pubkey.equals(swapData.claimer)) key.isSigner = true;
                    });
                }
            } else throw new Error("Invalid swap program version!");

            return new SolanaAction(sender, this.root, instruction, SwapInit.CUCosts.INIT_PAY_IN);
        } else {
            const instruction = await this.swapProgram.methods
                .offererInitialize(
                    swapData.toSwapDataStruct(),
                    swapData.securityDeposit,
                    swapData.claimerBounty,
                    [...(swapData.txoHash!=null ? Buffer.from(swapData.txoHash, "hex") : Buffer.alloc(32, 0))],
                    toBN(timeout)
                )
                .accounts({
                    ...accounts,
                    offererUserData: this.program._SwapUserVault(swapData.offerer, swapData.token),
                })
                .instruction();

            // Mark the claimer as signer for non payOut swaps
            if(isSwapProgramV2(this.swapProgram) && !swapData.isPayOut()) {
                instruction.keys.forEach(key => {
                    if(key.pubkey.equals(swapData.claimer)) key.isSigner = true;
                });
            }

            return new SolanaAction(sender, this.root, instruction, SwapInit.CUCosts.INIT);
        }
    }

    /**
     * InitPayIn action which includes SOL to WSOL wrapping if indicated by the fee rate
     *
     * @param signer
     * @param swapData
     * @param timeout
     * @param feeRate
     * @private
     */
    private async InitPayIn(sender: PublicKey, swapData: SolanaSwapData, timeout: bigint, feeRate?: string): Promise<SolanaAction> {
        if(!swapData.isPayIn()) throw new Error("Must be payIn==true");

        if(isSwapProgramV1(this.swapProgram)) {
            if(!sender.equals(swapData.offerer)) throw new Error("Transaction signer must be offerer for payIn=true escrows!");
        } else {
            if(!sender.equals(swapData.offerer) && !sender.equals(swapData.claimer)) throw new Error("Transaction signer must be either offerer or claimer claimer!");
        }

        const action = new SolanaAction(sender, this.root);
        if(this.shouldWrapOnInit(swapData, feeRate)) action.addAction(this.Wrap(swapData, feeRate), undefined, true);
        action.addAction(await this.Init(sender, swapData, timeout));
        return action;
    }

    /**
     * InitNotPayIn action with additional createAssociatedTokenAccountIdempotentInstruction instruction, such that
     *  a recipient ATA is created if it doesn't exist
     *
     * @param sender
     * @param swapData
     * @param timeout
     * @private
     */
    private async InitNotPayIn(sender: PublicKey, swapData: SolanaSwapData, timeout: bigint): Promise<SolanaAction> {
        if(swapData.isPayIn()) throw new Error("Must be payIn==false");

        if(isSwapProgramV1(this.swapProgram)) {
            if(!sender.equals(swapData.claimer)) throw new Error("Transaction signer must be claimer for payIn=false escrows!");
        } else {
            if(!sender.equals(swapData.offerer) && !sender.equals(swapData.claimer)) throw new Error("Transaction signer must be either offerer or claimer claimer!");
        }

        const action = new SolanaAction(sender, this.root);
        if(isSwapProgramV1(this.swapProgram)) {
            action.addIx(
                createAssociatedTokenAccountIdempotentInstruction(
                    sender,
                    swapData.claimerAta ?? await getAssociatedTokenAddress(swapData.token, swapData.claimer),
                    swapData.claimer,
                    swapData.token
                )
            );
        } // V2 doesn't explicitly check the token account on initialization, no need to open it
        action.addAction(await this.Init(sender, swapData, timeout));
        return action;
    }

    private Wrap(
        swapData: SolanaSwapData,
        feeRate?: string
    ): SolanaAction {
        const data = this.extractAtaDataFromFeeRate(feeRate);
        if(feeRate==null || data==null) throw new Error("Tried to add wrap instruction, but feeRate malformed: "+feeRate);
        return this.root.Tokens.Wrap(swapData.offerer, swapData.getAmount() - data.balance, data.initAta);
    }

    private extractAtaDataFromFeeRate(feeRate: undefined): null;
    private extractAtaDataFromFeeRate(feeRate: string): {balance: bigint, initAta: boolean};
    private extractAtaDataFromFeeRate(feeRate?: string): {balance: bigint, initAta: boolean} | null;
    /**
     * Extracts data about SOL to WSOL wrapping from the fee rate, fee rate is used to convey this information from
     *  the user to the intermediary, such that the intermediary creates valid signature for transaction including
     *  the SOL to WSOL wrapping instructions
     *
     * @param feeRate
     * @private
     */
    private extractAtaDataFromFeeRate(feeRate?: string): {balance: bigint, initAta: boolean} | null {
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
    private shouldWrapOnInit(swapData: SolanaSwapData, feeRate?: string): boolean {
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
    private async getTxToSign(signer: PublicKey, swapData: SolanaSwapData, timeout: string, feeRate?: string): Promise<Transaction> {
        let txSender: PublicKey;
        if(signer.equals(swapData.offerer)) {
            txSender = swapData.claimer;
        } else if(signer.equals(swapData.claimer)) {
            txSender = swapData.offerer;
        } else throw new Error("Signer needs to be either claimer or offerer of the swap!");

        const action = swapData.isPayIn() ?
            await this.InitPayIn(txSender, swapData, BigInt(timeout), feeRate) :
            await this.InitNotPayIn(txSender, swapData, BigInt(timeout));

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
            const estimatedSlotsPassed = Math.floor((Date.now()-preFetchedData.latestSlot.timestamp)/this.root._SLOT_TIME);
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

        if(isSwapProgramV1(this.swapProgram)) {
            if (!signer.getPublicKey().equals(swapData.isPayIn() ? swapData.claimer : swapData.offerer)) throw new Error("Invalid signer, wrong public key!");
        } else {
            if(!signer.getPublicKey().equals(swapData.offerer) && !signer.getPublicKey().equals(swapData.claimer)) throw new Error("Invalid signer, must be either offerer or claimer claimer!");
        }

        if(preFetchedBlockData!=null && Date.now()-preFetchedBlockData.timestamp>this.SIGNATURE_PREFETCH_DATA_VALIDITY) preFetchedBlockData = undefined;

        const {
            block: latestBlock,
            slot: latestSlot
        } = preFetchedBlockData || await this.root.Blocks.findLatestParsedBlock("finalized");

        const authTimeout = Math.floor(Date.now()/1000)+authorizationTimeout;
        const txToSign = await this.getTxToSign(signer.getPublicKey(), swapData, authTimeout.toString(10), feeRate);
        txToSign.feePayer = signer.getPublicKey().equals(swapData.offerer) ? swapData.claimer : swapData.offerer;
        txToSign.recentBlockhash = latestBlock.blockhash;
        txToSign.sign(signer.keypair);
        // this.logger.debug("signSwapInitialization(): Signed tx: ",txToSign);

        const sig = txToSign.signatures.find(e => e.publicKey.equals(signer.getPublicKey()));
        if(sig==null || sig.signature==null) throw new Error(`Unable to extract transaction signature! Signer: ${signer.getAddress()}`);

        return {
            prefix: this.getAuthPrefix(swapData),
            timeout: authTimeout.toString(10),
            signature: latestSlot+";"+sig.signature.toString("hex")
        };
    }

    /**
     * Checks whether the provided signature data is valid, using preFetchedData if provided and still valid
     *
     * @param sender
     * @param swapData
     * @param timeout
     * @param prefix
     * @param signature
     * @param feeRate
     * @param preFetchedData
     * @public
     */
    public async isSignatureValid(
        sender: PublicKey,
        swapData: SolanaSwapData,
        timeout: string,
        prefix: string,
        signature: string | null,
        feeRate?: string,
        preFetchedData?: SolanaPreFetchVerification
    ): Promise<Buffer> {
        if(isSwapProgramV1(this.swapProgram)) {
            if(swapData.isPayIn()) {
                if(!swapData.offerer.equals(sender)) throw new SignatureVerificationError("Sender needs to be offerer in payIn=true swaps");
            } else {
                if(!swapData.claimer.equals(sender)) throw new SignatureVerificationError("Sender needs to be claimer in payIn=false swaps");
            }
        }

        let signer: PublicKey;
        if(sender.equals(swapData.offerer)) {
            signer = swapData.claimer;
        } else if(sender.equals(swapData.claimer)) {
            signer = swapData.offerer;
        } else throw new Error("Signer needs to be either claimer or offerer of the swap!");

        if(!swapData.isPayIn() && await this.program.isExpired(sender.toString(), swapData)) {
            throw new SignatureVerificationError("Swap will expire too soon!");
        }

        if(prefix!==this.getAuthPrefix(swapData)) throw new SignatureVerificationError("Invalid prefix");

        const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
        const isExpired = (BigInt(timeout) - currentTimestamp) < BigInt(this.program._authGracePeriod);
        if (isExpired) throw new SignatureVerificationError("Authorization expired!");

        const requiresCounterpartySignature = isSwapProgramV1(this.swapProgram) || !swapData.isPayOut() || sender.equals(swapData.claimer);
        if(requiresCounterpartySignature) {
            if(signature==null) throw new SignatureVerificationError("Counterparty signature is required to initiate the swap!");
            const [transactionSlot, signatureString] = signature.split(";");
            const txSlot = parseInt(transactionSlot);

            const [latestSlot, blockhash] = await Promise.all([
                this.getSlotForSignature(preFetchedData),
                this.getBlockhashForSignature(txSlot, preFetchedData)
            ]);

            const lastValidTransactionSlot = txSlot+this.root._TX_SLOT_VALIDITY;
            const slotsLeft = lastValidTransactionSlot-latestSlot-this.SIGNATURE_SLOT_BUFFER;
            if(slotsLeft<0) throw new SignatureVerificationError("Authorization expired!");

            const txToSign = await this.getTxToSign(signer, swapData, timeout, feeRate);
            txToSign.feePayer = sender;
            txToSign.recentBlockhash = blockhash;
            txToSign.addSignature(signer, Buffer.from(signatureString, "hex"));
            // this.logger.debug("isSignatureValid(): Signed tx: ",txToSign);

            const valid = txToSign.verifySignatures(false);

            if(!valid) throw new SignatureVerificationError("Invalid signature!");

            return Buffer.from(blockhash);
        }

        return Buffer.alloc(32, 0);
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
        signature: string | null,
        preFetchedData?: SolanaPreFetchVerification
    ): Promise<number> {
        let expiry = (parseInt(timeout)-this.program._authGracePeriod)*1000;
        if(signature!=null) {
            const [transactionSlotStr, signatureString] = signature.split(";");
            const txSlot = parseInt(transactionSlotStr);

            const latestSlot = await this.getSlotForSignature(preFetchedData);
            const lastValidTransactionSlot = txSlot+this.root._TX_SLOT_VALIDITY;
            const slotsLeft = lastValidTransactionSlot-latestSlot-this.SIGNATURE_SLOT_BUFFER;

            const slotExpiryTime = Date.now() + (slotsLeft*this.root._SLOT_TIME);
            if(slotExpiryTime < expiry) expiry = slotExpiryTime;
        }

        if(expiry<Date.now()) return 0;

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
        signature: string | null,
        timeout: string
    ): Promise<boolean> {
        if(signature!=null) {
            const [transactionSlotStr, signatureString] = signature.split(";");
            const txSlot = parseInt(transactionSlotStr);

            const lastValidTransactionSlot = txSlot+this.root._TX_SLOT_VALIDITY;
            const latestSlot = await this.root.Slots.getSlot("finalized");
            const slotsLeft = lastValidTransactionSlot-latestSlot+this.SIGNATURE_SLOT_BUFFER;

            if(slotsLeft<0) return true;
        }
        if((parseInt(timeout)+this.program._authGracePeriod)*1000 < Date.now()) return true;
        return false;
    }

    /**
     * Creates init transaction (InitPayIn) with a valid signature from an LP, also adds a SOL to WSOL wrapping ix to
     *  the init transaction (if indicated by the fee rate) or adds the wrapping in a separate transaction (if no
     *  indication in the fee rate)
     *
     * @param sender
     * @param swapData swap to initialize
     * @param timeout init signature timeout
     * @param prefix init signature prefix
     * @param signature init signature
     * @param skipChecks whether to skip signature validity checks
     * @param feeRate fee rate to use for the transaction
     */
    public async txsInitPayIn(
        sender: PublicKey,
        swapData: SolanaSwapData,
        timeout: string,
        prefix: string,
        signature: string,
        skipChecks?: boolean,
        feeRate?: string
    ): Promise<SolanaTx[]> {
        if(isSwapProgramV1(this.swapProgram)) {
            if(!sender.equals(swapData.offerer)) throw new Error("Transaction sender has to be the offerer!");
        }

        let signer: PublicKey;
        if(sender.equals(swapData.offerer)) {
            signer = swapData.claimer;
        } else if(sender.equals(swapData.claimer)) {
            signer = swapData.offerer;
        } else throw new Error("Signer needs to be either claimer or offerer of the swap!");

        if(swapData.offererAta==undefined) throw new SwapDataVerificationError("No offererAta specified for payIn swap!");
        const offererAta = swapData.offererAta;

        const requiresCounterpartySignature = isSwapProgramV1(this.swapProgram) || !swapData.isPayOut() || sender.equals(swapData.claimer);

        if(!skipChecks) {
            const [_, payStatus] = await Promise.all([
                requiresCounterpartySignature ? this.isSignatureValid(sender, swapData, timeout, prefix, signature, feeRate) : Promise.resolve(),
                this.program.getClaimHashStatus(swapData.getClaimHash())
            ]);
            if(payStatus!==SwapCommitStateType.NOT_COMMITED) throw new SwapDataVerificationError("Invoice already being paid for or paid");
        }

        let block: BlockChecked | undefined;
        if(requiresCounterpartySignature) {
            const slotNumber = signature.split(";")[0];
            block = await tryWithRetries(
                () => this.root.Blocks.getParsedBlock(parseInt(slotNumber)),
                {maxRetries: 3, delay: 100, exponential: true}
            );
        }

        const txs: SolanaTx[] = [];

        let isWrapping: boolean = false;
        const isWrappedInSignedTx = feeRate!=null && feeRate.split("#").length>1;
        if(!isWrappedInSignedTx && swapData.token.equals(SolanaTokens.WSOL_ADDRESS)) {
            const ataAcc = await this.root.Tokens.getATAOrNull(offererAta);
            const balance: bigint = ataAcc?.amount ?? 0n;

            if(balance < swapData.getAmount()) {
                if(!swapData.offerer.equals(sender)) throw new Error("Additional SOL needs to be wrapped but the sender is not offerer!");

                //Need to wrap more SOL to WSOL
                await this.root.Tokens.Wrap(swapData.offerer, swapData.getAmount() - balance, ataAcc==null)
                    .addToTxs(txs, feeRate, block);
                isWrapping = true;
            }
        }

        const initTx = await (await this.InitPayIn(sender, swapData, BigInt(timeout), feeRate)).tx(feeRate, block);
        if(requiresCounterpartySignature) initTx.tx.addSignature(signer, Buffer.from(signature.split(";")[1], "hex"));
        txs.push(initTx);

        this.logger.debug("txsInitPayIn(): create swap init TX, swap: "+swapData.getClaimHash()+
            " wrapping client-side: "+isWrapping+" feerate: "+feeRate);

        return txs;
    }

    /**
     * Creates init transactions (InitNotPayIn) with a valid signature from an intermediary
     *
     * @param sender
     * @param swapData swap to initialize
     * @param timeout init signature timeout
     * @param prefix init signature prefix
     * @param signature init signature
     * @param skipChecks whether to skip signature validity checks
     * @param feeRate fee rate to use for the transaction
     */
    public async txsInit(sender: PublicKey, swapData: SolanaSwapData, timeout: string, prefix: string, signature: string, skipChecks?: boolean, feeRate?: string): Promise<SolanaTx[]> {
        if(isSwapProgramV1(this.swapProgram)) {
            if(!sender.equals(swapData.claimer)) throw new Error("Transaction sender has to be the claimer!");
        }

        let signer: PublicKey;
        if(sender.equals(swapData.offerer)) {
            signer = swapData.claimer;
        } else if(sender.equals(swapData.claimer)) {
            signer = swapData.offerer;
        } else throw new Error("Signer needs to be either claimer or offerer of the swap!");

        const requiresCounterpartySignature = isSwapProgramV1(this.swapProgram) || !swapData.isPayOut() || sender.equals(swapData.claimer);
        let block: BlockChecked | undefined;
        if(requiresCounterpartySignature) {
            if(!skipChecks) {
                await this.isSignatureValid(sender, swapData, timeout, prefix, signature, feeRate);
            }

            const slotNumber = signature.split(";")[0];
            block = await tryWithRetries(
                () => this.root.Blocks.getParsedBlock(parseInt(slotNumber)),
                {maxRetries: 3, delay: 100, exponential: true}
            );
        }

        const initTx = await (await this.InitNotPayIn(sender, swapData, BigInt(timeout))).tx(feeRate, block);
        if(requiresCounterpartySignature) initTx.tx.addSignature(signer, Buffer.from(signature.split(";")[1], "hex"));

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
            accounts.push(this.program._SwapVault(token));
            if (offerer != null) accounts.push(getAssociatedTokenAddressSync(token, offerer));
            if (claimer != null) accounts.push(this.program._SwapUserVault(claimer, token));
        }
        if (paymentHash != null) accounts.push(this.program._SwapEscrowState(Buffer.from(paymentHash, "hex")));

        const shouldCheckWSOLAta = token != null && offerer != null && token.equals(SolanaTokens.WSOL_ADDRESS);
        let [feeRate, account] = await Promise.all([
            this.root.Fees.getFeeRate(accounts),
            shouldCheckWSOLAta ?
                this.root.Tokens.getATAOrNull(getAssociatedTokenAddressSync(token, offerer)) :
                Promise.resolve(null)
        ]);

        if(shouldCheckWSOLAta) {
            const balance: bigint = account?.amount ?? 0n;
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

        if(offerer!=null && token!=null) accounts.push(this.program._SwapUserVault(offerer, token));
        if(claimer!=null) accounts.push(claimer)
        if(paymentHash!=null) accounts.push(this.program._SwapEscrowState(Buffer.from(paymentHash, "hex")));

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
            isSwapProgramV1(this.swapProgram) && swapData!=null && swapData.payOut ?
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

        feeRate = feeRate ??
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