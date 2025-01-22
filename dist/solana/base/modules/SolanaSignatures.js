"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSignatures = void 0;
const SolanaModule_1 = require("../SolanaModule");
const createHash = require("create-hash");
const tweetnacl_1 = require("tweetnacl");
const web3_js_1 = require("@solana/web3.js");
const buffer_1 = require("buffer");
class SolanaSignatures extends SolanaModule_1.SolanaModule {
    ///////////////////
    //// Data signatures
    /**
     * Produces an ed25519 signature over the sha256 of a specified data Buffer, only works with providers which
     *  expose their private key (i.e. backend based, not browser wallet based)
     *
     * @param signer
     * @param data data to sign
     */
    getDataSignature(signer, data) {
        if (signer.keypair == null)
            throw new Error("Unsupported");
        const buff = createHash("sha256").update(data).digest();
        const signature = tweetnacl_1.sign.detached(buff, signer.keypair.secretKey);
        return Promise.resolve(buffer_1.Buffer.from(signature).toString("hex"));
    }
    /**
     * Checks whether a signature is a valid Ed25519 signature produced by publicKey over a data message (computes
     *  sha256 hash of the message)
     *
     * @param data signed data
     * @param signature data signature
     * @param publicKey public key of the signer
     */
    isValidDataSignature(data, signature, publicKey) {
        const hash = createHash("sha256").update(data).digest();
        return Promise.resolve(tweetnacl_1.sign.detached.verify(hash, buffer_1.Buffer.from(signature, "hex"), new web3_js_1.PublicKey(publicKey).toBuffer()));
    }
}
exports.SolanaSignatures = SolanaSignatures;
