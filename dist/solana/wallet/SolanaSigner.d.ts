import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { AbstractSigner } from "@atomiqlabs/base";
import { PublicKey, Signer } from "@solana/web3.js";
/**
 * Solana signer implementation wrapping an Anchor Wallet
 * @category Wallets
 */
export declare class SolanaSigner implements AbstractSigner {
    /**
     * @inheritDoc
     */
    type: "AtomiqAbstractSigner";
    /**
     * Wrapped wallet implementation used for signing.
     */
    wallet: Wallet;
    /**
     * Optional raw keypair signer when available.
     */
    keypair?: Signer;
    constructor(wallet: Wallet, keypair?: Signer);
    /**
     * Returns public key of the wrapped wallet.
     */
    getPublicKey(): PublicKey;
    /**
     * @inheritDoc
     */
    getAddress(): string;
}
