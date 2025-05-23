import {SolanaSwapModule} from "../SolanaSwapModule";
import {SolanaSwapData} from "../SolanaSwapData";
import {sha256} from "@noble/hashes/sha2";
import {sign} from "tweetnacl";
import {SignatureVerificationError, SwapDataVerificationError} from "@atomiqlabs/base";
import {SolanaTx} from "../../chain/modules/SolanaTransactions";
import {
    Ed25519Program,
    PublicKey,
    SYSVAR_INSTRUCTIONS_PUBKEY
} from "@solana/web3.js";
import {
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {SolanaAction} from "../../chain/SolanaAction";
import {toBN, tryWithRetries} from "../../../utils/Utils";
import {Buffer} from "buffer";
import {SolanaSigner} from "../../wallet/SolanaSigner";
import {SolanaTokens} from "../../chain/modules/SolanaTokens";
import * as BN from "bn.js";

export class SwapRefund extends SolanaSwapModule {

    private static readonly CUCosts = {
        REFUND: 15000,
        REFUND_PAY_OUT: 50000
    };

    /**
     * Action for generic Refund instruction
     *
     * @param swapData
     * @param refundAuthTimeout optional refund authorization timeout (should be 0 for refunding expired swaps)
     * @constructor
     * @private
     */
    private async Refund(swapData: SolanaSwapData, refundAuthTimeout?: bigint): Promise<SolanaAction> {
        const accounts = {
            offerer: swapData.offerer,
            claimer: swapData.claimer,
            escrowState: this.program.SwapEscrowState(Buffer.from(swapData.paymentHash, "hex")),
            claimerUserData: !swapData.payOut ? this.program.SwapUserVault(swapData.claimer, swapData.token) : null,
            ixSysvar: refundAuthTimeout!=null ? SYSVAR_INSTRUCTIONS_PUBKEY : null
        };

        const useTimeout = refundAuthTimeout!=null ? refundAuthTimeout : 0n;
        if(swapData.isPayIn()) {
            const ata = getAssociatedTokenAddressSync(swapData.token, swapData.offerer);

            return new SolanaAction(swapData.offerer, this.root,
                await this.swapProgram.methods
                    .offererRefundPayIn(toBN(useTimeout))
                    .accounts({
                        ...accounts,
                        offererAta: ata,
                        vault: this.program.SwapVault(swapData.token),
                        vaultAuthority: this.program.SwapVaultAuthority,
                        tokenProgram: TOKEN_PROGRAM_ID
                    })
                    .instruction(),
                SwapRefund.CUCosts.REFUND_PAY_OUT
            );
        } else {
            return new SolanaAction(swapData.offerer, this.root,
                await this.swapProgram.methods
                    .offererRefund(toBN(useTimeout))
                    .accounts({
                        ...accounts,
                        offererUserData: this.program.SwapUserVault(swapData.offerer, swapData.token)
                    })
                    .instruction(),
                SwapRefund.CUCosts.REFUND
            );
        }
    }

    /**
     * Action for refunding with signature, adds the Ed25519 verify instruction
     *
     * @param swapData
     * @param timeout
     * @param prefix
     * @param signature
     * @constructor
     * @private
     */
    private async RefundWithSignature(
        swapData: SolanaSwapData,
        timeout: string,
        prefix: string,
        signature: Buffer
    ): Promise<SolanaAction> {
        const action = new SolanaAction(swapData.offerer, this.root,
            Ed25519Program.createInstructionWithPublicKey({
                message: this.getRefundMessage(swapData, prefix, timeout),
                publicKey: swapData.claimer.toBuffer(),
                signature: signature
            }),
            0,
            null,
            null,
            true
        );
        action.addAction(await this.Refund(swapData, BigInt(timeout)));
        return action;
    }

    /**
     * Gets the message to be signed as a refund authorization
     *
     * @param swapData
     * @param prefix
     * @param timeout
     * @private
     */
    private getRefundMessage(swapData: SolanaSwapData, prefix: string, timeout: string): Buffer {
        const messageBuffers = [
            Buffer.from(prefix, "ascii"),
            swapData.amount.toArrayLike(Buffer, "le", 8),
            swapData.expiry.toArrayLike(Buffer, "le", 8),
            swapData.sequence.toArrayLike(Buffer, "le", 8),
            Buffer.from(swapData.paymentHash, "hex"),
            new BN(timeout).toArrayLike(Buffer, "le", 8)
        ];

        return Buffer.from(sha256(Buffer.concat(messageBuffers)));
    }

    /**
     * Checks whether we should unwrap the WSOL to SOL when refunding the swap
     *
     * @param swapData
     * @private
     */
    private shouldUnwrap(swapData: SolanaSwapData): boolean {
        return swapData.isPayIn() &&
            swapData.token.equals(SolanaTokens.WSOL_ADDRESS) &&
            swapData.offerer.equals(swapData.offerer);
    }

    public signSwapRefund(
        signer: SolanaSigner,
        swapData: SolanaSwapData,
        authorizationTimeout: number
    ): Promise<{ prefix: string; timeout: string; signature: string }> {
        if(signer.keypair==null) throw new Error("Unsupported");
        if(!signer.getPublicKey().equals(swapData.claimer)) throw new Error("Invalid signer, public key mismatch!");

        const authPrefix = "refund";
        const authTimeout = Math.floor(Date.now()/1000)+authorizationTimeout;

        const messageBuffer = this.getRefundMessage(swapData, authPrefix, authTimeout.toString(10));
        const signature = sign.detached(messageBuffer, signer.keypair.secretKey);

        return Promise.resolve({
            prefix: authPrefix,
            timeout: authTimeout.toString(10),
            signature: Buffer.from(signature).toString("hex")
        });
    }

    public isSignatureValid(swapData: SolanaSwapData, timeout: string, prefix: string, signature: string): Promise<Buffer> {
        if(prefix!=="refund") throw new SignatureVerificationError("Invalid prefix");

        const expiryTimestamp = BigInt(timeout);
        const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

        const isExpired = (expiryTimestamp - currentTimestamp) < BigInt(this.program.authGracePeriod);
        if(isExpired) throw new SignatureVerificationError("Authorization expired!");

        const signatureBuffer = Buffer.from(signature, "hex");
        const messageBuffer = this.getRefundMessage(swapData, prefix, timeout);

        if(!sign.detached.verify(messageBuffer, signatureBuffer, swapData.claimer.toBuffer())) {
            throw new SignatureVerificationError("Invalid signature!");
        }

        return Promise.resolve(messageBuffer);
    }

    /**
     * Creates transactions required for refunding timed out swap, also unwraps WSOL to SOL
     *
     * @param swapData swap data to refund
     * @param check whether to check if swap is already expired and refundable
     * @param initAta should initialize ATA if it doesn't exist
     * @param feeRate fee rate to be used for the transactions
     */
    public async txsRefund(
        swapData: SolanaSwapData,
        check?: boolean,
        initAta?: boolean,
        feeRate?: string
    ): Promise<SolanaTx[]> {
        if(check && !await tryWithRetries(() => this.program.isRequestRefundable(swapData.offerer.toString(), swapData), this.retryPolicy)) {
            throw new SwapDataVerificationError("Not refundable yet!");
        }
        const shouldInitAta = swapData.isPayIn() && !await this.root.Tokens.ataExists(swapData.offererAta);
        if(shouldInitAta && !initAta) throw new SwapDataVerificationError("ATA not initialized");

        if(feeRate==null) feeRate = await this.program.getRefundFeeRate(swapData)

        const shouldUnwrap = this.shouldUnwrap(swapData);
        const action = new SolanaAction(swapData.offerer, this.root);
        if(shouldInitAta) {
            const initAction = this.root.Tokens.InitAta(swapData.offerer, swapData.offerer, swapData.token, swapData.offererAta);
            if(initAction==null) throw new SwapDataVerificationError("Invalid claimer token account address")
            action.addAction(initAction);
        }
        action.add(await this.Refund(swapData));
        if(shouldUnwrap) action.add(this.root.Tokens.Unwrap(swapData.offerer));

        this.logger.debug("txsRefund(): creating claim transaction, swap: "+swapData.getClaimHash()+
            " initializingAta: "+shouldInitAta+" unwrapping: "+shouldUnwrap);

        return [await action.tx(feeRate)];
    }

    /**
     * Creates transactions required for refunding the swap with authorization signature, also unwraps WSOL to SOL
     *
     * @param swapData swap data to refund
     * @param timeout signature timeout
     * @param prefix signature prefix of the counterparty
     * @param signature signature of the counterparty
     * @param check whether to check if swap is committed before attempting refund
     * @param initAta should initialize ATA if it doesn't exist
     * @param feeRate fee rate to be used for the transactions
     */
    public async txsRefundWithAuthorization(
        swapData: SolanaSwapData,
        timeout: string,
        prefix: string,
        signature: string,
        check?: boolean,
        initAta?: boolean,
        feeRate?: string
    ): Promise<SolanaTx[]> {
        if(check && !await tryWithRetries(() => this.program.isCommited(swapData), this.retryPolicy)) {
            throw new SwapDataVerificationError("Not correctly committed");
        }
        await tryWithRetries(
            () => this.isSignatureValid(swapData, timeout, prefix, signature),
            this.retryPolicy,
            (e) => e instanceof SignatureVerificationError
        );
        const shouldInitAta = swapData.isPayIn() && !await this.root.Tokens.ataExists(swapData.offererAta);
        if(shouldInitAta && !initAta) throw new SwapDataVerificationError("ATA not initialized");

        if(feeRate==null) feeRate = await this.program.getRefundFeeRate(swapData);
        console.log("[SolanaSwapProgram] txsRefundsWithAuthorization: feeRate: ", feeRate);

        const signatureBuffer = Buffer.from(signature, "hex");

        const shouldUnwrap = this.shouldUnwrap(swapData);
        const action = await this.RefundWithSignature(swapData, timeout, prefix, signatureBuffer);
        if(shouldInitAta) {
            const initAction = this.root.Tokens.InitAta(swapData.offerer, swapData.offerer, swapData.token, swapData.offererAta);
            if(initAction==null) throw new SwapDataVerificationError("Invalid claimer token account address");
            action.addAction(initAction, 1); //Need to add it after the Ed25519 verify IX, but before the actual refund IX
        }
        if(shouldUnwrap) action.add(this.root.Tokens.Unwrap(swapData.offerer));

        this.logger.debug("txsRefundWithAuthorization(): creating claim transaction, swap: "+swapData.getClaimHash()+
            " initializingAta: "+shouldInitAta+" unwrapping: "+shouldUnwrap+
            " auth expiry: "+timeout+" signature: "+signature);

        return [await action.tx(feeRate)];
    }

    public getRefundFeeRate(swapData: SolanaSwapData): Promise<string> {
        const accounts: PublicKey[] = [];
        if(swapData.payIn) {
            if(swapData.token!=null) accounts.push(this.program.SwapVault(swapData.token));
            if(swapData.offerer!=null) accounts.push(swapData.offerer);
            if(swapData.claimer!=null) accounts.push(swapData.claimer);
            if(swapData.offererAta!=null && !swapData.offererAta.equals(PublicKey.default)) accounts.push(swapData.offererAta);
        } else {
            if(swapData.offerer!=null) {
                accounts.push(swapData.offerer);
                if(swapData.token!=null) accounts.push(this.program.SwapUserVault(swapData.offerer, swapData.token));
            }
            if(swapData.claimer!=null) accounts.push(swapData.claimer);
        }

        if(swapData.paymentHash!=null) accounts.push(this.program.SwapEscrowState(Buffer.from(swapData.paymentHash, "hex")));

        return this.root.Fees.getFeeRate(accounts);
    }

    /**
     * Get the estimated solana transaction fee of the refund transaction, in the worst case scenario in case where the
     *  ATA needs to be initialized again (i.e. adding the ATA rent exempt lamports to the fee)
     */
    async getRefundFee(swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        return BigInt(swapData==null || swapData.payIn ? SolanaTokens.SPL_ATA_RENT_EXEMPT : 0) +
            await this.getRawRefundFee(swapData, feeRate);
    }

    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    async getRawRefundFee(swapData: SolanaSwapData, feeRate?: string): Promise<bigint> {
        if(swapData==null) return 10000n;

        feeRate = feeRate || await this.getRefundFeeRate(swapData);

        const computeBudget = swapData.payIn ? SwapRefund.CUCosts.REFUND_PAY_OUT : SwapRefund.CUCosts.REFUND;

        return 10000n + this.root.Fees.getPriorityFee(computeBudget, feeRate);
    }

}