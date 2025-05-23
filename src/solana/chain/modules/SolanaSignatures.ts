import {SolanaModule} from "../SolanaModule";
import {sign} from "tweetnacl";
import {PublicKey} from "@solana/web3.js";
import {Buffer} from "buffer";
import {SolanaSigner} from "../../wallet/SolanaSigner";
import {sha256} from "@noble/hashes/sha2";

export class SolanaSignatures extends SolanaModule {

    ///////////////////
    //// Data signatures
    /**
     * Produces an ed25519 signature over the sha256 of a specified data Buffer, only works with providers which
     *  expose their private key (i.e. backend based, not browser wallet based)
     *
     * @param signer
     * @param data data to sign
     */
    getDataSignature(signer: SolanaSigner, data: Buffer): Promise<string> {
        if(signer.keypair==null) throw new Error("Unsupported");
        const buff = sha256(data);
        const signature = sign.detached(buff, signer.keypair.secretKey);

        return Promise.resolve(Buffer.from(signature).toString("hex"));
    }

    /**
     * Checks whether a signature is a valid Ed25519 signature produced by publicKey over a data message (computes
     *  sha256 hash of the message)
     *
     * @param data signed data
     * @param signature data signature
     * @param publicKey public key of the signer
     */
    isValidDataSignature(data: Buffer, signature: string, publicKey: string): Promise<boolean> {
        const hash = sha256(data);
        return Promise.resolve(sign.detached.verify(hash, Buffer.from(signature, "hex"), new PublicKey(publicKey).toBuffer()));
    }

}