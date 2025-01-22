"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaBase = void 0;
const SolanaFees_1 = require("./modules/SolanaFees");
const SolanaBlocks_1 = require("./modules/SolanaBlocks");
const SolanaSlots_1 = require("./modules/SolanaSlots");
const SolanaTokens_1 = require("./modules/SolanaTokens");
const SolanaTransactions_1 = require("./modules/SolanaTransactions");
const SolanaAddresses_1 = require("./modules/SolanaAddresses");
const SolanaSignatures_1 = require("./modules/SolanaSignatures");
const SolanaEvents_1 = require("./modules/SolanaEvents");
const Utils_1 = require("../../utils/Utils");
class SolanaBase {
    constructor(connection, retryPolicy, solanaFeeEstimator = new SolanaFees_1.SolanaFees(connection)) {
        this.SLOT_TIME = 400;
        this.TX_SLOT_VALIDITY = 151;
        this.logger = (0, Utils_1.getLogger)(this.constructor.name + ": ");
        this.connection = connection;
        this.retryPolicy = retryPolicy;
        this.Blocks = new SolanaBlocks_1.SolanaBlocks(this);
        this.Fees = solanaFeeEstimator;
        this.Slots = new SolanaSlots_1.SolanaSlots(this);
        this.Tokens = new SolanaTokens_1.SolanaTokens(this);
        this.Transactions = new SolanaTransactions_1.SolanaTransactions(this);
        this.Addresses = new SolanaAddresses_1.SolanaAddresses(this);
        this.Signatures = new SolanaSignatures_1.SolanaSignatures(this);
        this.Events = new SolanaEvents_1.SolanaEvents(this);
    }
}
exports.SolanaBase = SolanaBase;
