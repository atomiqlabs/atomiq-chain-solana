"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaAction = void 0;
const web3_js_1 = require("@solana/web3.js");
class SolanaAction {
    constructor(mainSigner, root, instructions = [], computeBudget = 0, feeRate, signers, firstIxBeforeComputeBudget) {
        this.firstIxBeforeComputeBudget = false;
        this.mainSigner = mainSigner;
        this.root = root;
        this.instructions = Array.isArray(instructions) ? instructions : [instructions];
        this.computeBudget = computeBudget;
        this.feeRate = feeRate;
        this.signers = signers || [];
        if (firstIxBeforeComputeBudget != null)
            this.firstIxBeforeComputeBudget = firstIxBeforeComputeBudget;
    }
    estimateFee() {
        const mutableAccounts = [];
        this.instructions.forEach(ix => ix.keys.forEach(key => key.isWritable && mutableAccounts.push(key.pubkey)));
        return this.root.Fees.getFeeRate(mutableAccounts);
    }
    addIx(instruction, computeBudget, signers) {
        this.instructions.push(instruction);
        if (this.computeBudget == null) {
            this.computeBudget = computeBudget;
        }
        else {
            if (computeBudget != null)
                this.computeBudget += computeBudget;
        }
    }
    add(action) {
        return this.addAction(action);
    }
    addAction(action, index = this.instructions.length) {
        if (action.firstIxBeforeComputeBudget) {
            if (this.instructions.length > 0)
                throw new Error("Tried to add firstIxBeforeComputeBudget action to existing action with instructions");
            this.firstIxBeforeComputeBudget = true;
        }
        if (this.firstIxBeforeComputeBudget && this.instructions.length > 0 && index === 0)
            throw new Error("Tried adding to firstIxBeforeComputeBudget action on 0th index");
        if (!action.mainSigner.equals(this.mainSigner))
            throw new Error("Actions need to have the same signer!");
        if (this.computeBudget == null && action.computeBudget != null)
            this.computeBudget = action.computeBudget;
        if (this.computeBudget != null && action.computeBudget != null)
            this.computeBudget += action.computeBudget;
        this.instructions.splice(index, 0, ...action.instructions);
        this.signers.push(...action.signers);
        if (this.feeRate == null)
            this.feeRate = action.feeRate;
        return this;
    }
    async tx(feeRate, block) {
        const tx = new web3_js_1.Transaction();
        tx.feePayer = this.mainSigner;
        if (feeRate == null)
            feeRate = this.feeRate;
        if (feeRate == null)
            feeRate = await this.estimateFee();
        let instructions = this.instructions;
        if (instructions.length > 0 && this.firstIxBeforeComputeBudget) {
            tx.add(this.instructions[0]);
            instructions = this.instructions.slice(1);
        }
        this.root.Fees.applyFeeRateBegin(tx, this.computeBudget, feeRate);
        instructions.forEach(ix => tx.add(ix));
        this.root.Fees.applyFeeRateEnd(tx, this.computeBudget, feeRate);
        if (block != null) {
            tx.recentBlockhash = block.blockhash;
            tx.lastValidBlockHeight = block.blockHeight + this.root.TX_SLOT_VALIDITY;
        }
        return {
            tx,
            signers: this.signers
        };
    }
    async addToTxs(txs, feeRate, block) {
        txs.push(await this.tx(feeRate, block));
    }
    ixsLength() {
        return this.instructions.length;
    }
}
exports.SolanaAction = SolanaAction;
