import { SolanaModule } from "../SolanaModule";
export declare class SolanaAddresses extends SolanaModule {
    /**
     * Checks whether an address is a valid Solana address (base58 encoded ed25519 public key)
     *
     * @param address
     */
    isValidAddress(address: string): boolean;
}
