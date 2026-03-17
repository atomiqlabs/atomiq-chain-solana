"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaChainEvents = void 0;
/**
 * Node.js-only entrypoint for filesystem-backed Solana helpers.
 *
 * Import from `@atomiqlabs/chain-solana/node` when you need runtime features
 * that depend on Node's `fs` module.
 *
 * @packageDocumentation
 */
var SolanaChainEvents_1 = require("../solana/events/SolanaChainEvents");
Object.defineProperty(exports, "SolanaChainEvents", { enumerable: true, get: function () { return SolanaChainEvents_1.SolanaChainEvents; } });
