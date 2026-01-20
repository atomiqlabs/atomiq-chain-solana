/// <reference types="node" />
/// <reference types="node" />
import { SolanaSwapModule } from "../SolanaSwapModule";
import { SolanaSwapData } from "../SolanaSwapData";
import { SolanaTx } from "../../chain/modules/SolanaTransactions";
import { Buffer } from "buffer";
import { SolanaSigner } from "../../wallet/SolanaSigner";
export declare class SwapRefund extends SolanaSwapModule {
    private static readonly CUCosts;
    /**
     * Action for generic Refund instruction
     *
     * @param swapData
     * @param refundAuthTimeout optional refund authorization timeout (should be 0 for refunding expired swaps)
     * @private
     */
    private Refund;
    /**
     * Action for refunding with signature, adds the Ed25519 verify instruction
     *
     * @param swapData
     * @param timeout
     * @param prefix
     * @param signature
     * @private
     */
    private RefundWithSignature;
    /**
     * Gets the message to be signed as a refund authorization
     *
     * @param swapData
     * @param prefix
     * @param timeout
     * @private
     */
    private getRefundMessage;
    /**
     * Checks whether we should unwrap the WSOL to SOL when refunding the swap
     *
     * @param swapData
     * @private
     */
    private shouldUnwrap;
    signSwapRefund(signer: SolanaSigner, swapData: SolanaSwapData, authorizationTimeout: number): Promise<{
        prefix: string;
        timeout: string;
        signature: string;
    }>;
    isSignatureValid(swapData: SolanaSwapData, timeout: string, prefix: string, signature: string): Promise<Buffer>;
    /**
     * Creates transactions required for refunding timed out swap, also unwraps WSOL to SOL
     *
     * @param swapData swap data to refund
     * @param check whether to check if swap is already expired and refundable
     * @param initAta should initialize ATA if it doesn't exist
     * @param feeRate fee rate to be used for the transactions
     */
    txsRefund(swapData: SolanaSwapData, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]>;
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
    txsRefundWithAuthorization(swapData: SolanaSwapData, timeout: string, prefix: string, signature: string, check?: boolean, initAta?: boolean, feeRate?: string): Promise<SolanaTx[]>;
    getRefundFeeRate(swapData: SolanaSwapData): Promise<string>;
    /**
     * Get the estimated solana transaction fee of the refund transaction, in the worst case scenario in case where the
     *  ATA needs to be initialized again (i.e. adding the ATA rent exempt lamports to the fee)
     */
    getRefundFee(swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
    /**
     * Get the estimated solana transaction fee of the refund transaction
     */
    getRawRefundFee(swapData: SolanaSwapData, feeRate?: string): Promise<bigint>;
}
