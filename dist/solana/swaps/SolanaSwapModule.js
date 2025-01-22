"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSwapModule = void 0;
const SolanaModule_1 = require("../base/SolanaModule");
class SolanaSwapModule extends SolanaModule_1.SolanaModule {
    constructor(root) {
        super(root);
        this.root = root;
        this.program = root.program;
    }
}
exports.SolanaSwapModule = SolanaSwapModule;
