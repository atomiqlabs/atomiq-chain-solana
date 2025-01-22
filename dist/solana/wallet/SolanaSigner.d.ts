import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { AbstractSigner } from "@atomiqlabs/base";
import { PublicKey, Signer } from "@solana/web3.js";
export declare class SolanaSigner implements AbstractSigner {
    wallet: Wallet;
    keypair?: Signer;
    constructor(wallet: Wallet, keypair?: Signer);
    getPublicKey(): PublicKey;
    getAddress(): string;
}
