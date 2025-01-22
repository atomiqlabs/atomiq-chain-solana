/// <reference types="node" />
import { SolanaModule } from "../SolanaModule";
import { Buffer } from "buffer";
import { SolanaSigner } from "../../wallet/SolanaSigner";
export declare class SolanaSignatures extends SolanaModule {
    /**
     * Produces an ed25519 signature over the sha256 of a specified data Buffer, only works with providers which
     *  expose their private key (i.e. backend based, not browser wallet based)
     *
     * @param signer
     * @param data data to sign
     */
    getDataSignature(signer: SolanaSigner, data: Buffer): Promise<string>;
    /**
     * Checks whether a signature is a valid Ed25519 signature produced by publicKey over a data message (computes
     *  sha256 hash of the message)
     *
     * @param data signed data
     * @param signature data signature
     * @param publicKey public key of the signer
     */
    isValidDataSignature(data: Buffer, signature: string, publicKey: string): Promise<boolean>;
}
