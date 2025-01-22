export declare class SwapTypeEnum {
    static toChainSwapType(data: any): number;
    static toNumber(data: any): number;
    static fromNumber(kind: 0 | 1 | 2 | 3): {
        htlc?: never;
        chain?: never;
        chainNonced?: never;
    } & {
        chainTxhash: Record<string, never>;
    };
}
