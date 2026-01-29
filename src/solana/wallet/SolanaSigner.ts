import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import {AbstractSigner} from "@atomiqlabs/base";
import {PublicKey, Signer} from "@solana/web3.js";

/**
 * Solana signer implementation wrapping an Anchor Wallet
 * @category Wallets
 */
export class SolanaSigner implements AbstractSigner {
    type = "AtomiqAbstractSigner" as const;

    wallet: Wallet;
    keypair?: Signer;

    constructor(wallet: Wallet, keypair?: Signer) {
        this.wallet = wallet;
        this.keypair = keypair;
    }

    getPublicKey(): PublicKey {
        return this.wallet.publicKey;
    }

    /**
     * @inheritDoc
     */
    getAddress(): string {
        return this.wallet.publicKey.toString();
    }

}
