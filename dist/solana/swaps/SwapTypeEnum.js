"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapTypeEnum = void 0;
const base_1 = require("@atomiqlabs/base");
class SwapTypeEnum {
    static toChainSwapType(data) {
        const text = Object.keys(data)[0];
        if (text === "htlc")
            return base_1.ChainSwapType.HTLC;
        if (text === "chain")
            return base_1.ChainSwapType.CHAIN;
        if (text === "chainNonced")
            return base_1.ChainSwapType.CHAIN_NONCED;
        if (text === "chainTxhash")
            return base_1.ChainSwapType.CHAIN_TXID;
        return null;
    }
    static toNumber(data) {
        const text = Object.keys(data)[0];
        if (text === "htlc")
            return 0;
        if (text === "chain")
            return 1;
        if (text === "chainNonced")
            return 2;
        if (text === "chainTxhash")
            return 3;
        return null;
    }
    static fromNumber(kind) {
        if (kind === 0)
            return { htlc: null };
        if (kind === 1)
            return { chain: null };
        if (kind === 2)
            return { chainNonced: null };
        if (kind === 3)
            return { chainTxhash: null };
    }
}
exports.SwapTypeEnum = SwapTypeEnum;
;
