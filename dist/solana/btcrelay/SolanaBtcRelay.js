"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaBtcRelay = void 0;
const web3_js_1 = require("@solana/web3.js");
const SolanaBtcStoredHeader_1 = require("./headers/SolanaBtcStoredHeader");
const SolanaBtcHeader_1 = require("./headers/SolanaBtcHeader");
const programIdl = require("./program/programIdl.json");
const base_1 = require("@atomiqlabs/base");
const SolanaProgramBase_1 = require("../program/SolanaProgramBase");
const SolanaAction_1 = require("../chain/SolanaAction");
const buffer_1 = require("buffer");
const BN = require("bn.js");
const MAX_CLOSE_IX_PER_TX = 10;
function serializeBlockHeader(e) {
    return new SolanaBtcHeader_1.SolanaBtcHeader({
        version: e.getVersion(),
        reversedPrevBlockhash: [...buffer_1.Buffer.from(e.getPrevBlockhash(), "hex").reverse()],
        merkleRoot: [...buffer_1.Buffer.from(e.getMerkleRoot(), "hex").reverse()],
        timestamp: e.getTimestamp(),
        nbits: e.getNbits(),
        nonce: e.getNonce(),
        hash: buffer_1.Buffer.from(e.getHash(), "hex").reverse()
    });
}
;
class SolanaBtcRelay extends SolanaProgramBase_1.SolanaProgramBase {
    /**
     * Creates initialization action for initializing the btc relay
     *
     * @param signer
     * @param header
     * @param epochStart
     * @param pastBlocksTimestamps
     * @constructor
     * @private
     */
    async Initialize(signer, header, epochStart, pastBlocksTimestamps) {
        const serializedBlock = serializeBlockHeader(header);
        return new SolanaAction_1.SolanaAction(signer, this.Chain, await this.program.methods
            .initialize(serializedBlock, header.getHeight(), header.getChainWork(), epochStart, pastBlocksTimestamps)
            .accounts({
            signer,
            mainState: this.BtcRelayMainState,
            headerTopic: this.BtcRelayHeader(serializedBlock.hash),
            systemProgram: web3_js_1.SystemProgram.programId
        })
            .instruction(), 100000);
    }
    /**
     * Creates verify action to be used with the swap program, specifies the action to be firstIxBeforeComputeBudget,
     *  such that the verify instruction will always be the 0th in the transaction, this is required because
     *  swap program expects the verify instruction to be at the 0th position
     *
     * @param signer
     * @param reversedTxId
     * @param confirmations
     * @param position
     * @param reversedMerkleProof
     * @param committedHeader
     */
    async Verify(signer, reversedTxId, confirmations, position, reversedMerkleProof, committedHeader) {
        return new SolanaAction_1.SolanaAction(signer, this.Chain, await this.program.methods
            .verifyTransaction(reversedTxId, confirmations, position, reversedMerkleProof, committedHeader)
            .accounts({
            signer,
            mainState: this.BtcRelayMainState
        })
            .instruction(), undefined, undefined, undefined, true);
    }
    async CloseForkAccount(signer, forkId) {
        return new SolanaAction_1.SolanaAction(signer, this.Chain, await this.program.methods
            .closeForkAccount(new BN(forkId))
            .accounts({
            signer,
            forkState: this.BtcRelayFork(forkId, signer),
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .instruction(), 20000);
    }
    constructor(chainInterface, bitcoinRpc, programAddress) {
        super(chainInterface, programIdl, programAddress);
        this.BtcRelayMainState = this.pda("state");
        this.BtcRelayHeader = this.pda("header", (hash) => [hash]);
        this.BtcRelayFork = this.pda("fork", (forkId, pubkey) => [new BN(forkId).toArrayLike(buffer_1.Buffer, "le", 8), pubkey.toBuffer()]);
        this.maxHeadersPerTx = 5;
        this.maxForkHeadersPerTx = 4;
        this.maxShortForkHeadersPerTx = 4;
        this.bitcoinRpc = bitcoinRpc;
    }
    /**
     * Gets set of block commitments representing current main chain from the mainState
     *
     * @param mainState
     * @private
     */
    getBlockCommitmentsSet(mainState) {
        const storedCommitments = new Set();
        mainState.blockCommitments.forEach((e) => {
            storedCommitments.add(buffer_1.Buffer.from(e).toString("hex"));
        });
        return storedCommitments;
    }
    /**
     * Computes subsequent commited headers as they will appear on the blockchain when transactions
     *  are submitted & confirmed
     *
     * @param initialStoredHeader
     * @param syncedHeaders
     * @private
     */
    computeCommitedHeaders(initialStoredHeader, syncedHeaders) {
        const computedCommitedHeaders = [initialStoredHeader];
        for (let blockHeader of syncedHeaders) {
            computedCommitedHeaders.push(computedCommitedHeaders[computedCommitedHeaders.length - 1].computeNext(blockHeader));
        }
        return computedCommitedHeaders;
    }
    /**
     * A common logic for submitting blockheaders in a transaction
     *
     * @param signer
     * @param headers headers to sync to the btc relay
     * @param storedHeader current latest stored block header for a given fork
     * @param forkId forkId to submit to, forkId=0 means main chain
     * @param feeRate feeRate for the transaction
     * @param createTx transaction generator function
     * @private
     */
    async _saveHeaders(signer, headers, storedHeader, forkId, feeRate, createTx) {
        const blockHeaderObj = headers.map(serializeBlockHeader);
        const tx = await createTx(blockHeaderObj)
            .remainingAccounts(blockHeaderObj.map(e => {
            return {
                pubkey: this.BtcRelayHeader(e.hash),
                isSigner: false,
                isWritable: false
            };
        }))
            .transaction();
        tx.feePayer = signer;
        this.Chain.Fees.applyFeeRateBegin(tx, null, feeRate);
        this.Chain.Fees.applyFeeRateEnd(tx, null, feeRate);
        const computedCommitedHeaders = this.computeCommitedHeaders(storedHeader, blockHeaderObj);
        const lastStoredHeader = computedCommitedHeaders[computedCommitedHeaders.length - 1];
        return {
            forkId: forkId,
            lastStoredHeader,
            tx: {
                tx,
                signers: []
            },
            computedCommitedHeaders
        };
    }
    /**
     * Returns data about current main chain tip stored in the btc relay
     */
    async getTipData() {
        const data = await this.program.account.mainState.fetchNullable(this.BtcRelayMainState);
        if (data == null)
            return null;
        return {
            blockheight: data.blockHeight,
            commitHash: buffer_1.Buffer.from(data.tipCommitHash).toString("hex"),
            blockhash: buffer_1.Buffer.from(data.tipBlockHash).reverse().toString("hex"),
            chainWork: buffer_1.Buffer.from(data.chainWork)
        };
    }
    /**
     * Retrieves blockheader with a specific blockhash, returns null if requiredBlockheight is provided and
     *  btc relay contract is not synced up to the desired blockheight
     *
     * @param blockData
     * @param requiredBlockheight
     */
    async retrieveLogAndBlockheight(blockData, requiredBlockheight) {
        const mainState = await this.program.account.mainState.fetch(this.BtcRelayMainState);
        if (requiredBlockheight != null && mainState.blockHeight < requiredBlockheight) {
            return null;
        }
        const storedCommitments = this.getBlockCommitmentsSet(mainState);
        const blockHashBuffer = buffer_1.Buffer.from(blockData.blockhash, 'hex').reverse();
        const topicKey = this.BtcRelayHeader(blockHashBuffer);
        const data = await this.Events.findInEvents(topicKey, async (event) => {
            if (event.name === "StoreFork" || event.name === "StoreHeader") {
                const eventData = event.data;
                const commitHash = buffer_1.Buffer.from(eventData.commitHash).toString("hex");
                if (blockHashBuffer.equals(buffer_1.Buffer.from(eventData.blockHash)) && storedCommitments.has(commitHash))
                    return {
                        header: new SolanaBtcStoredHeader_1.SolanaBtcStoredHeader(eventData.header),
                        height: mainState.blockHeight,
                        commitHash
                    };
            }
        });
        if (data != null)
            this.logger.debug("retrieveLogAndBlockheight(): block found," +
                " commit hash: " + data.commitHash + " blockhash: " + blockData.blockhash + " height: " + data.height);
        return data;
    }
    /**
     * Retrieves blockheader data by blockheader's commit hash,
     *
     * @param commitmentHashStr
     * @param blockData
     */
    async retrieveLogByCommitHash(commitmentHashStr, blockData) {
        const blockHashBuffer = buffer_1.Buffer.from(blockData.blockhash, "hex").reverse();
        const topicKey = this.BtcRelayHeader(blockHashBuffer);
        const data = await this.Events.findInEvents(topicKey, async (event) => {
            if (event.name === "StoreFork" || event.name === "StoreHeader") {
                const eventData = event.data;
                const commitHash = buffer_1.Buffer.from(eventData.commitHash).toString("hex");
                if (commitmentHashStr === commitHash)
                    return new SolanaBtcStoredHeader_1.SolanaBtcStoredHeader(eventData.header);
            }
        });
        if (data != null)
            this.logger.debug("retrieveLogByCommitHash(): block found," +
                " commit hash: " + commitmentHashStr + " blockhash: " + blockData.blockhash + " height: " + data.blockheight);
        return data;
    }
    /**
     * Retrieves latest known stored blockheader & blockheader from bitcoin RPC that is in the main chain
     */
    async retrieveLatestKnownBlockLog() {
        const mainState = await this.program.account.mainState.fetch(this.BtcRelayMainState);
        const storedCommitments = this.getBlockCommitmentsSet(mainState);
        const data = await this.Events.findInEvents(this.program.programId, async (event) => {
            if (event.name === "StoreFork" || event.name === "StoreHeader") {
                const eventData = event.data;
                const blockHashHex = buffer_1.Buffer.from(eventData.blockHash).reverse().toString("hex");
                const isInMainChain = await this.bitcoinRpc.isInMainChain(blockHashHex).catch(() => false);
                const commitHash = buffer_1.Buffer.from(eventData.commitHash).toString("hex");
                //Check if this fork is part of main chain
                if (isInMainChain && storedCommitments.has(commitHash)) {
                    const blockHeader = await this.bitcoinRpc.getBlockHeader(blockHashHex);
                    if (blockHeader == null)
                        return null;
                    return {
                        resultStoredHeader: new SolanaBtcStoredHeader_1.SolanaBtcStoredHeader(eventData.header),
                        resultBitcoinHeader: blockHeader,
                        commitHash: commitHash
                    };
                }
            }
        }, undefined, 10);
        if (data != null)
            this.logger.debug("retrieveLatestKnownBlockLog(): block found," +
                " commit hash: " + data.commitHash + " blockhash: " + data.resultBitcoinHeader.getHash() +
                " height: " + data.resultStoredHeader.blockheight);
        return data;
    }
    /**
     * Saves initial block header when the btc relay is in uninitialized state
     *
     * @param signer
     * @param header a bitcoin blockheader to submit
     * @param epochStart timestamp of the start of the epoch (block timestamp at blockheight-(blockheight%2016))
     * @param pastBlocksTimestamps timestamp of the past 10 blocks
     * @param feeRate fee rate to use for the transaction
     */
    async saveInitialHeader(signer, header, epochStart, pastBlocksTimestamps, feeRate) {
        if (pastBlocksTimestamps.length !== 10)
            throw new Error("Invalid prevBlocksTimestamps");
        const action = await this.Initialize(new web3_js_1.PublicKey(signer), header, epochStart, pastBlocksTimestamps);
        this.logger.debug("saveInitialHeader(): saving initial header, blockhash: " + header.getHash() +
            " blockheight: " + header.getHeight() + " epochStart: " + epochStart + " past block timestamps: " + pastBlocksTimestamps.join());
        return await action.tx(feeRate);
    }
    /**
     * Saves blockheaders as a bitcoin main chain to the btc relay
     *
     * @param signer
     * @param mainHeaders
     * @param storedHeader
     * @param feeRate
     */
    async saveMainHeaders(signer, mainHeaders, storedHeader, feeRate) {
        feeRate ?? (feeRate = await this.getMainFeeRate(signer));
        this.logger.debug("saveMainHeaders(): submitting main blockheaders, count: " + mainHeaders.length);
        const _signer = new web3_js_1.PublicKey(signer);
        return await this._saveHeaders(_signer, mainHeaders, storedHeader, 0, feeRate, (blockHeaders) => this.program.methods
            .submitBlockHeaders(blockHeaders, storedHeader)
            .accounts({
            signer: _signer,
            mainState: this.BtcRelayMainState,
        }));
    }
    /**
     * Creates a new long fork and submits the headers to it
     *
     * @param signer
     * @param forkHeaders
     * @param storedHeader
     * @param tipWork
     * @param feeRate
     */
    async saveNewForkHeaders(signer, forkHeaders, storedHeader, tipWork, feeRate) {
        const mainState = await this.program.account.mainState.fetch(this.BtcRelayMainState);
        let forkId = mainState.forkCounter;
        feeRate ?? (feeRate = await this.getForkFeeRate(signer, forkId.toNumber()));
        const _signer = new web3_js_1.PublicKey(signer);
        this.logger.debug("saveNewForkHeaders(): submitting new fork & blockheaders," +
            " count: " + forkHeaders.length + " forkId: " + forkId.toString(10));
        const result = await this._saveHeaders(_signer, forkHeaders, storedHeader, forkId.toNumber(), feeRate, (blockHeaders) => this.program.methods
            .submitForkHeaders(blockHeaders, storedHeader, forkId, true)
            .accounts({
            signer: _signer,
            mainState: this.BtcRelayMainState,
            forkState: this.BtcRelayFork(forkId.toNumber(), _signer),
            systemProgram: web3_js_1.SystemProgram.programId,
        }));
        if (result.forkId !== 0 && base_1.StatePredictorUtils.gtBuffer(buffer_1.Buffer.from(result.lastStoredHeader.chainWork), tipWork)) {
            //Fork's work is higher than main chain's work, this fork will become a main chain
            result.forkId = 0;
        }
        return result;
    }
    /**
     * Continues submitting blockheaders to a given fork
     *
     * @param signer
     * @param forkHeaders
     * @param storedHeader
     * @param forkId
     * @param tipWork
     * @param feeRate
     */
    async saveForkHeaders(signer, forkHeaders, storedHeader, forkId, tipWork, feeRate) {
        feeRate ?? (feeRate = await this.getForkFeeRate(signer, forkId));
        this.logger.debug("saveForkHeaders(): submitting blockheaders to existing fork," +
            " count: " + forkHeaders.length + " forkId: " + forkId.toString(10));
        const _signer = new web3_js_1.PublicKey(signer);
        const result = await this._saveHeaders(_signer, forkHeaders, storedHeader, forkId, feeRate, (blockHeaders) => this.program.methods
            .submitForkHeaders(blockHeaders, storedHeader, new BN(forkId), false)
            .accounts({
            signer: _signer,
            mainState: this.BtcRelayMainState,
            forkState: this.BtcRelayFork(forkId, _signer),
            systemProgram: web3_js_1.SystemProgram.programId,
        }));
        if (result.forkId !== 0 && base_1.StatePredictorUtils.gtBuffer(buffer_1.Buffer.from(result.lastStoredHeader.chainWork), tipWork)) {
            //Fork's work is higher than main chain's work, this fork will become a main chain
            result.forkId = 0;
        }
        return result;
    }
    /**
     * Submits short fork with given blockheaders
     *
     * @param signer
     * @param forkHeaders
     * @param storedHeader
     * @param tipWork
     * @param feeRate
     */
    async saveShortForkHeaders(signer, forkHeaders, storedHeader, tipWork, feeRate) {
        feeRate ?? (feeRate = await this.getMainFeeRate(signer));
        this.logger.debug("saveShortForkHeaders(): submitting short fork blockheaders," +
            " count: " + forkHeaders.length);
        const _signer = new web3_js_1.PublicKey(signer);
        const result = await this._saveHeaders(_signer, forkHeaders, storedHeader, -1, feeRate, (blockHeaders) => this.program.methods
            .submitShortForkHeaders(blockHeaders, storedHeader)
            .accounts({
            signer: _signer,
            mainState: this.BtcRelayMainState
        }));
        if (result.forkId !== 0 && base_1.StatePredictorUtils.gtBuffer(buffer_1.Buffer.from(result.lastStoredHeader.chainWork), tipWork)) {
            //Fork's work is higher than main chain's work, this fork will become a main chain
            result.forkId = 0;
        }
        return result;
    }
    /**
     * Sweeps fork data PDAs back to self
     *
     * @param signer
     * @param lastSweepId lastCheckedId returned from the previous sweepForkData() call
     * @returns {number} lastCheckedId that should be passed to the next call of sweepForkData()
     */
    async sweepForkData(signer, lastSweepId) {
        const mainState = await this.program.account.mainState.fetch(this.BtcRelayMainState);
        let forkId = mainState.forkCounter.toNumber();
        const txs = [];
        let action = new SolanaAction_1.SolanaAction(signer.getPublicKey(), this.Chain);
        let lastCheckedId = lastSweepId;
        for (let i = lastSweepId == null ? 0 : lastSweepId + 1; i <= forkId; i++) {
            lastCheckedId = i;
            const accountAddr = this.BtcRelayFork(i, signer.getPublicKey());
            let forkState = await this.program.account.forkState.fetchNullable(accountAddr);
            if (forkState == null)
                continue;
            this.logger.info("sweepForkData(): sweeping forkId: " + i);
            action.add(await this.CloseForkAccount(signer.getPublicKey(), i));
            if (action.ixsLength() >= MAX_CLOSE_IX_PER_TX) {
                await action.addToTxs(txs);
                action = new SolanaAction_1.SolanaAction(signer.getPublicKey(), this.Chain);
            }
        }
        if (action.ixsLength() >= MAX_CLOSE_IX_PER_TX) {
            await action.addToTxs(txs);
        }
        if (txs.length > 0) {
            const signatures = await this.Chain.sendAndConfirm(signer, txs, true);
            this.logger.info("sweepForkData(): forks swept, signatures: " + signatures.join());
        }
        return lastCheckedId ?? null;
    }
    /**
     * Estimate required synchronization fee (worst case) to synchronize btc relay to the required blockheight
     *
     * @param requiredBlockheight
     * @param feeRate
     */
    async estimateSynchronizeFee(requiredBlockheight, feeRate) {
        const tipData = await this.getTipData();
        if (tipData == null)
            throw new Error("Cannot get relay tip data, relay not initialized?");
        const currBlockheight = tipData.blockheight;
        const blockheightDelta = requiredBlockheight - currBlockheight;
        if (blockheightDelta <= 0)
            return 0n;
        const synchronizationFee = BigInt(blockheightDelta) * await this.getFeePerBlock(feeRate);
        this.logger.debug("estimateSynchronizeFee(): required blockheight: " + requiredBlockheight +
            " blockheight delta: " + blockheightDelta + " fee: " + synchronizationFee.toString(10));
        return synchronizationFee;
    }
    /**
     * Returns fee required (in SOL) to synchronize a single block to btc relay
     *
     * @param feeRate
     */
    async getFeePerBlock(feeRate) {
        // feeRate = feeRate || await this.getMainFeeRate(null);
        // return BASE_FEE_SOL_PER_BLOCKHEADER.add(this.Fees.getPriorityFee(200000, feeRate, false));
        return 50000n;
    }
    /**
     * Gets fee rate required for submitting blockheaders to the main chain
     */
    getMainFeeRate(signer) {
        const _signer = signer == null ? null : new web3_js_1.PublicKey(signer);
        return this.Chain.Fees.getFeeRate(_signer == null ? [this.BtcRelayMainState] : [
            _signer,
            this.BtcRelayMainState
        ]);
    }
    /**
     * Gets fee rate required for submitting blockheaders to the specific fork
     */
    getForkFeeRate(signer, forkId) {
        const _signer = new web3_js_1.PublicKey(signer);
        return this.Chain.Fees.getFeeRate([
            _signer,
            this.BtcRelayMainState,
            this.BtcRelayFork(forkId, _signer)
        ]);
    }
}
exports.SolanaBtcRelay = SolanaBtcRelay;
