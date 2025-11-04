"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaSwapModule = void 0;
const SolanaProgramModule_1 = require("../program/SolanaProgramModule");
class SolanaSwapModule extends SolanaProgramModule_1.SolanaProgramModule {
    constructor(chainInterface, program) {
        super(chainInterface, program);
        this.program = program;
        this.swapProgram = program.program;
    }
}
exports.SolanaSwapModule = SolanaSwapModule;
