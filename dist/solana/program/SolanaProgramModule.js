"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaProgramModule = void 0;
const SolanaModule_1 = require("../chain/SolanaModule");
class SolanaProgramModule extends SolanaModule_1.SolanaModule {
    constructor(chainInterface, program) {
        super(chainInterface);
        this.program = program;
    }
}
exports.SolanaProgramModule = SolanaProgramModule;
