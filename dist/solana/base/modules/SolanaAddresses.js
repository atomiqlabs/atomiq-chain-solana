"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaAddresses = void 0;
const SolanaModule_1 = require("../SolanaModule");
const web3_js_1 = require("@solana/web3.js");
class SolanaAddresses extends SolanaModule_1.SolanaModule {
    ///////////////////
    //// Address utils
    /**
     * Checks whether an address is a valid Solana address (base58 encoded ed25519 public key)
     *
     * @param address
     */
    isValidAddress(address) {
        try {
            return web3_js_1.PublicKey.isOnCurve(address);
        }
        catch (e) {
            return false;
        }
    }
}
exports.SolanaAddresses = SolanaAddresses;
