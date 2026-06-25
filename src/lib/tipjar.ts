import { Address, nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { type SendResult, simulateRead, submitWithRetry } from "./soroban-tx";

/**
 * TipJar contract client (server-side).
 *
 * - Call TipJar.record_tip() after a successful x402 settlement
 * - Call TipJar.get_tips() to read the tipping wall
 *
 * The server is the only authorized writer (Phase 6 design). Soroban
 * build/sign/send/poll + simulate live in `./soroban-tx`.
 */

function getContractId(): string {
  const id = process.env.TIPJAR_CONTRACT_ID;
  if (!id) {
    throw new Error("TIPJAR_CONTRACT_ID is not set in env");
  }
  return id;
}

/**
 * Represents a tip message as returned by the contract.
 * Matches the Rust `TipMessage` struct.
 */
export type TipMessage = {
  from: string;
  amount: bigint;
  note: string;
  timestamp: bigint;
  /** Hex-encoded hash of the x402 USDC settlement tx. */
  txHash: string;
};

/**
 * Convert a 64-char hex string (Stellar tx hash) to a 32-byte Buffer that
 * nativeToScVal can encode as BytesN<32>. Accepts an optional `0x` prefix.
 */
function hexToBytes32(hex: string): Buffer {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 64 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`tx hash must be 32 bytes hex (got ${clean.length} chars)`);
  }
  return Buffer.from(clean, "hex");
}

function bytes32ToHex(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Record a tip message on-chain via the TipJar contract.
 *
 * Retries up to 3 times. Returns `{ ok: false }` if all attempts fail — callers
 * should NOT fail the whole tip flow on a false return (the USDC transfer has
 * already settled via x402); just log it and return 200 with a warning.
 */
export async function recordTipMessage(
  from: string,
  to: string,
  amount: bigint,
  note: string,
  txHash: string,
): Promise<SendResult> {
  const args: xdr.ScVal[] = [
    new Address(from).toScVal(),
    new Address(to).toScVal(),
    nativeToScVal(amount, { type: "i128" }),
    nativeToScVal(note, { type: "string" }),
    nativeToScVal(hexToBytes32(txHash), { type: "bytes" }),
  ];
  return submitWithRetry(getContractId(), "record_tip", args, "tipjar");
}

/**
 * Read all tip messages for a creator from the TipJar contract.
 *
 * Read-only simulation — fast and free. Contract returns newest-first.
 */
export async function getTipMessages(to: string): Promise<TipMessage[]> {
  const raw = (await simulateRead(getContractId(), "get_tips", [
    new Address(to).toScVal(),
  ])) as Array<{
    from: string;
    amount: bigint;
    note: string;
    timestamp: bigint;
    tx_hash: Uint8Array;
  }> | null;
  if (!raw) return [];

  return raw.map((r) => ({
    from: r.from,
    amount: r.amount,
    note: r.note,
    timestamp: r.timestamp,
    txHash: bytes32ToHex(r.tx_hash),
  }));
}
