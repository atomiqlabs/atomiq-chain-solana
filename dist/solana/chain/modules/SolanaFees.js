"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaFees = void 0;
const web3_js_1 = require("@solana/web3.js");
const Utils_1 = require("../../../utils/Utils");
const MAX_FEE_AGE = 5000;
class SolanaFees {
    constructor(connection, maxFeeMicroLamports = 250000, numSamples = 8, period = 150, useHeliusApi = "auto", heliusFeeLevel = "veryHigh", getStaticFee, bribeData) {
        this.heliusApiSupported = true;
        this.logger = (0, Utils_1.getLogger)("SolanaFees: ");
        this.blockFeeCache = null;
        this.connection = connection;
        this.maxFeeMicroLamports = BigInt(maxFeeMicroLamports);
        this.numSamples = numSamples;
        this.period = period;
        this.useHeliusApi = useHeliusApi;
        this.heliusFeeLevel = heliusFeeLevel;
        this.bribeData = bribeData;
        this.getStaticFee = getStaticFee;
    }
    /**
     * Returns solana block with transactionDetails="signatures"
     *
     * @param slot
     * @private
     */
    async getBlockWithSignature(slot) {
        const response = await this.connection._rpcRequest("getBlock", [
            slot,
            {
                encoding: "json",
                transactionDetails: "signatures",
                commitment: "confirmed",
                rewards: true
            }
        ]);
        if (response.error != null) {
            if (response.error.code === -32004 || response.error.code === -32007 || response.error.code === -32009 || response.error.code === -32014) {
                return null;
            }
            throw new Error(response.error.message);
        }
        return response.result;
    }
    /**
     * Returns fee estimate from Helius API - only works with Helius RPC, return null for all other RPC providers
     *
     * @param mutableAccounts
     * @private
     */
    async getPriorityFeeEstimate(mutableAccounts) {
        //Try to use getPriorityFeeEstimate api of Helius
        const response = await this.connection._rpcRequest("getPriorityFeeEstimate", [
            {
                "accountKeys": mutableAccounts.map(e => e.toBase58()),
                "options": {
                    "includeAllPriorityFeeLevels": true
                }
            }
        ]).catch(e => {
            //Catching not supported errors
            if (e.message != null && (e.message.includes("-32601") || e.message.includes("-32600"))) {
                return {
                    error: {
                        code: -32601,
                        message: e.message
                    }
                };
            }
            throw e;
        });
        if (response.error != null) {
            //Catching not supported errors
            if (response.error.code !== -32601 && response.error.code !== -32600)
                throw new Error(response.error.message);
            return null;
        }
        return response.result.priorityFeeLevels;
    }
    /**
     * Sends the transaction over Jito
     *
     * @param tx
     * @param options
     * @private
     * @returns {Promise<string>} transaction signature
     */
    async sendJitoTx(tx, options) {
        if (this.bribeData?.endpoint == null)
            throw new Error("Jito endpoint not specified!");
        if (options == null)
            options = {};
        const request = await fetch(this.bribeData.endpoint, {
            method: "POST",
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "sendTransaction",
                params: [tx.toString("base64"), {
                        ...options,
                        encoding: "base64"
                    }],
            }),
            headers: {
                "Content-Type": "application/json"
            }
        });
        if (request.ok) {
            const parsedResponse = await request.json();
            // console.log(parsedResponse);
            return parsedResponse.result;
        }
        throw new Error(await request.text());
    }
    /**
     * Checks whether the transaction should be sent over Jito, returns the fee paid to Jito in case the transaction
     *  should be sent over Jito, returns null if the transaction shouldn't be sent over Jito
     *
     * @param parsedTx
     * @private
     */
    getJitoTxFee(parsedTx) {
        const lastIx = parsedTx.instructions[parsedTx.instructions.length - 1];
        if (!lastIx.programId.equals(web3_js_1.SystemProgram.programId))
            return null;
        if (web3_js_1.SystemInstruction.decodeInstructionType(lastIx) !== "Transfer")
            return null;
        const decodedIxData = web3_js_1.SystemInstruction.decodeTransfer(lastIx);
        if (decodedIxData.toPubkey.toBase58() !== this.bribeData?.address)
            return null;
        return decodedIxData.lamports;
    }
    /**
     * Gets the mean microLamports/CU fee rate for the block at a specific slot
     *
     * @param slot
     * @private
     */
    async getBlockMeanFeeRate(slot) {
        const block = await this.getBlockWithSignature(slot);
        if (block == null)
            return null;
        const blockComission = block.rewards.find(e => e.rewardType === "Fee");
        const totalBlockFees = BigInt(blockComission.lamports) * 2n;
        //Subtract per-signature fees to get pure compute fees
        const totalTransactionBaseFees = BigInt(block.signatures.length) * 5000n;
        const computeFees = totalBlockFees - totalTransactionBaseFees;
        //Total compute fees in micro lamports
        const computeFeesMicroLamports = computeFees * 1000000n;
        //micro lamports per CU considering block was full (48M compute units)
        const perCUMicroLamports = computeFeesMicroLamports / 48000000n;
        this.logger.debug("getBlockMeanFeeRate(): slot: " + slot + " total reward: " + totalBlockFees.toString(10) +
            " total transactions: " + block.signatures.length + " computed fee: " + perCUMicroLamports);
        return perCUMicroLamports;
    }
    /**
     * Manually gets global fee rate by sampling random blocks over the last period
     *
     * @private
     * @returns {Promise<BN>} sampled mean microLamports/CU fee over the last period
     */
    async _getGlobalFeeRate() {
        let slot = await this.connection.getSlot();
        const slots = [];
        for (let i = 0; i < this.period; i++) {
            slots.push(slot - i);
        }
        const promises = [];
        for (let i = 0; i < this.numSamples; i++) {
            promises.push((async () => {
                let feeRate = null;
                while (feeRate == null) {
                    if (slots.length === 0)
                        throw new Error("Ran out of slots to check!");
                    const index = Math.floor(Math.random() * slots.length);
                    const slotNumber = slots[index];
                    slots.splice(index, 1);
                    feeRate = await this.getBlockMeanFeeRate(slotNumber);
                }
                return feeRate;
            })());
        }
        const meanFees = await Promise.all(promises);
        let min = null;
        meanFees.forEach(e => min == null || min > e ? min = e : 0);
        if (min != null)
            this.logger.debug("_getGlobalFeeRate(): slot: " + slot + " global fee minimum: " + min.toString(10));
        return min;
    }
    /**
     * Gets the combined microLamports/CU fee rate (from localized & global fee market)
     *
     * @param mutableAccounts
     * @private
     */
    async _getFeeRate(mutableAccounts) {
        if (this.useHeliusApi === "yes" || (this.useHeliusApi === "auto" && this.heliusApiSupported)) {
            //Try to use getPriorityFeeEstimate api of Helius
            const fees = await this.getPriorityFeeEstimate(mutableAccounts);
            if (fees != null) {
                let calculatedFee = BigInt(fees[this.heliusFeeLevel]);
                if (calculatedFee < 8000n)
                    calculatedFee = 8000n;
                if (calculatedFee > this.maxFeeMicroLamports)
                    calculatedFee = this.maxFeeMicroLamports;
                return calculatedFee;
            }
            this.logger.warn("_getFeeRate(): tried fetching fees from Helius API, not supported," +
                " falling back to client-side fee estimation");
            this.heliusApiSupported = false;
        }
        const [globalFeeRate, localFeeRate] = await Promise.all([
            this.getGlobalFeeRate(),
            this.connection.getRecentPrioritizationFees({
                lockedWritableAccounts: mutableAccounts
            }).then(resp => {
                let lamports = 0;
                for (let i = 20; i >= 0; i--) {
                    const data = resp[resp.length - i - 1];
                    if (data != null)
                        lamports = Math.min(lamports, data.prioritizationFee);
                }
                return BigInt(lamports);
            })
        ]);
        let fee = globalFeeRate;
        if (fee < localFeeRate)
            fee = localFeeRate;
        if (fee < 8000n)
            fee = 8000n;
        if (fee > this.maxFeeMicroLamports)
            fee = this.maxFeeMicroLamports;
        return fee;
    }
    /**
     * Gets global fee rate, with caching
     *
     * @returns {Promise<BN>} global fee rate microLamports/CU
     */
    getGlobalFeeRate() {
        if (this.blockFeeCache == null || Date.now() - this.blockFeeCache.timestamp > MAX_FEE_AGE) {
            let obj = {
                timestamp: Date.now(),
                feeRate: null
            };
            obj.feeRate = this._getGlobalFeeRate().catch(e => {
                if (this.blockFeeCache === obj)
                    this.blockFeeCache = null;
                throw e;
            });
            this.blockFeeCache = obj;
        }
        return this.blockFeeCache.feeRate;
    }
    /**
     * Gets the combined microLamports/CU fee rate (from localized & global fee market), cached & adjusted as for
     *  when bribe and/or static fee should be included, format: <uLamports/CU>;<static fee lamport>[;<bribe address>]
     *
     * @param mutableAccounts
     * @private
     */
    async getFeeRate(mutableAccounts) {
        let feeMicroLamportPerCU = await this._getFeeRate(mutableAccounts);
        if (this.bribeData?.getBribeFee != null)
            feeMicroLamportPerCU = this.bribeData.getBribeFee(feeMicroLamportPerCU);
        let fee = feeMicroLamportPerCU.toString(10);
        if (this.getStaticFee != null) {
            fee += ";" + this.getStaticFee(feeMicroLamportPerCU);
        }
        else {
            fee += ";0";
        }
        if (this.bribeData?.address) {
            fee += ";" + this.bribeData.address;
        }
        this.logger.debug("getFeeRate(): calculated fee: " + fee);
        return fee;
    }
    /**
     * Calculates the total priority fee paid for a given compute budget at a given fee rate
     *
     * @param computeUnits
     * @param feeRate
     * @param includeStaticFee whether the include the static/base part of the fee rate
     */
    getPriorityFee(computeUnits, feeRate, includeStaticFee = true) {
        if (feeRate == null)
            return 0n;
        const hashArr = feeRate.split("#");
        if (hashArr.length > 1) {
            feeRate = hashArr[0];
        }
        const arr = feeRate.split(";");
        const cuPrice = BigInt(arr[0]);
        const staticFee = includeStaticFee ? BigInt(arr[1]) : 0n;
        return staticFee + (cuPrice * BigInt(computeUnits) / 1000000n);
    }
    /**
     * Applies fee rate to a transaction at the beginning of the transaction (has to be called after
     *  feePayer is set for the tx), specifically adds the setComputeUnitLimit & setComputeUnitPrice instruction
     *
     * @param tx
     * @param computeBudget
     * @param feeRate
     */
    applyFeeRateBegin(tx, computeBudget, feeRate) {
        if (feeRate == null)
            return false;
        const hashArr = feeRate.split("#");
        if (hashArr.length > 1) {
            feeRate = hashArr[0];
        }
        if (computeBudget != null && computeBudget > 0)
            tx.add(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
                units: computeBudget,
            }));
        //Check if bribe is included
        const arr = feeRate.split(";");
        if (arr.length > 2) {
        }
        else {
            let fee = BigInt(arr[0]);
            if (arr.length > 1) {
                const staticFee = BigInt(arr[1]);
                const cuBigInt = BigInt(computeBudget || (200000 * Utils_1.SolanaTxUtils.getNonComputeBudgetIxs(tx)));
                const staticFeePerCU = staticFee * BigInt(1000000) / cuBigInt;
                fee += staticFeePerCU;
            }
            tx.add(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: fee
            }));
        }
    }
    /**
     * Applies fee rate to the end of the transaction (has to be called after feePayer is set for the tx),
     *  specifically adds the bribe SystemProgram.transfer instruction
     *
     * @param tx
     * @param computeBudget
     * @param feeRate
     */
    applyFeeRateEnd(tx, computeBudget, feeRate) {
        if (feeRate == null)
            return false;
        const hashArr = feeRate.split("#");
        if (hashArr.length > 1) {
            feeRate = hashArr[0];
        }
        //Check if bribe is included
        const arr = feeRate.split(";");
        if (arr.length > 2) {
            const cuBigInt = BigInt(computeBudget || (200000 * (Utils_1.SolanaTxUtils.getNonComputeBudgetIxs(tx) + 1)));
            const cuPrice = BigInt(arr[0]);
            const staticFee = BigInt(arr[1]);
            const bribeAddress = new web3_js_1.PublicKey(arr[2]);
            tx.add(web3_js_1.SystemProgram.transfer({
                fromPubkey: tx.feePayer,
                toPubkey: bribeAddress,
                lamports: staticFee + (cuBigInt * cuPrice / BigInt(1000000))
            }));
            return;
        }
    }
    /**
     * Checks if the transaction should be submitted over Jito and if yes submits it
     *
     * @param tx
     * @param options
     * @returns {Promise<string | null>} null if the transaction was not sent over Jito, tx signature when tx was sent over Jito
     */
    submitTx(tx, options) {
        const parsedTx = web3_js_1.Transaction.from(tx);
        const jitoFee = this.getJitoTxFee(parsedTx);
        if (jitoFee == null)
            return null;
        this.logger.info("submitTx(): sending tx over Jito, signature: " + parsedTx.signature + " fee: " + jitoFee.toString(10));
        return this.sendJitoTx(tx, options);
    }
}
exports.SolanaFees = SolanaFees;
