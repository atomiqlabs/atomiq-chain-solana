import {Connection} from "@solana/web3.js";
import {SolanaChainInterface, SolanaRetryPolicy} from "./SolanaChainInterface";
import {getLogger} from "../../utils/Utils";

export class SolanaModule {

    protected readonly connection: Connection;
    protected readonly retryPolicy: SolanaRetryPolicy;
    protected readonly root: SolanaChainInterface;

    protected readonly logger = getLogger(this.constructor.name+": ");

    constructor(
        root: SolanaChainInterface
    ) {
        this.connection = root.connection;
        this.retryPolicy = root.retryPolicy;
        this.root = root;
    }

}