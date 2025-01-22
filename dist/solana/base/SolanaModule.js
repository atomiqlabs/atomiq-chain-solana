"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaModule = void 0;
const Utils_1 = require("../../utils/Utils");
class SolanaModule {
    constructor(root) {
        this.logger = (0, Utils_1.getLogger)(this.constructor.name + ": ");
        this.connection = root.connection;
        this.retryPolicy = root.retryPolicy;
        this.root = root;
    }
}
exports.SolanaModule = SolanaModule;
