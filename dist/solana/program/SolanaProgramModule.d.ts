import { SolanaModule } from "../chain/SolanaModule";
import { Idl } from "@coral-xyz/anchor";
import { SolanaProgramBase } from "./SolanaProgramBase";
import { SolanaChainInterface } from "../chain/SolanaChainInterface";
export declare class SolanaProgramModule<IDL extends Idl> extends SolanaModule {
    protected readonly program: SolanaProgramBase<IDL>;
    constructor(chainInterface: SolanaChainInterface, program: SolanaProgramBase<IDL>);
}
