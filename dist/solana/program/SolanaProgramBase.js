"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaProgramBase = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const SolanaFees_1 = require("../base/modules/SolanaFees");
const SolanaBase_1 = require("../base/SolanaBase");
const SolanaProgramEvents_1 = require("./modules/SolanaProgramEvents");
const web3_js_1 = require("@solana/web3.js");
const sha2_1 = require("@noble/hashes/sha2");
const buffer_1 = require("buffer");
const SolanaKeypairWallet_1 = require("../wallet/SolanaKeypairWallet");
/**
 * Base class providing program specific utilities
 */
class SolanaProgramBase extends SolanaBase_1.SolanaBase {
    constructor(connection, programIdl, programAddress, retryPolicy, solanaFeeEstimator = new SolanaFees_1.SolanaFees(connection)) {
        super(connection, retryPolicy, solanaFeeEstimator);
        this.program = new anchor_1.Program(programIdl, programAddress || programIdl.metadata.address, new anchor_1.AnchorProvider(connection, new SolanaKeypairWallet_1.SolanaKeypairWallet(web3_js_1.Keypair.generate()), {}));
        this.Events = new SolanaProgramEvents_1.SolanaProgramEvents(this);
    }
    pda(seed, func) {
        if (func == null) {
            return web3_js_1.PublicKey.findProgramAddressSync([buffer_1.Buffer.from(seed)], this.program.programId)[0];
        }
        return (...args) => {
            const res = func(...args);
            return web3_js_1.PublicKey.findProgramAddressSync([buffer_1.Buffer.from(seed)].concat(res), this.program.programId)[0];
        };
    }
    /**
     * Returns a function for deriving a dynamic deterministic keypair from dynamic arguments
     *
     * @param func function translating the function argument to Buffer[] to be used for deriving the keypair
     */
    keypair(func) {
        return (...args) => {
            const res = func(...args);
            const buff = (0, sha2_1.sha256)(buffer_1.Buffer.concat(res));
            return web3_js_1.Keypair.fromSeed(buff);
        };
    }
}
exports.SolanaProgramBase = SolanaProgramBase;
