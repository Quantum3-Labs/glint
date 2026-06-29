import "server-only";
import { Address, nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { type SendResult, simulateRead, submitWithRetry } from "../soroban-tx";
import { bytes32ToField, fieldToBytes32 } from "./fields";

/**
 * Patronage pool contract client (server-side / relayer + admin).
 *
 * - `register_payout` / `create_poll` are admin-gated (server keypair).
 * - `withdraw` / `post` / `vote` are open: the server relays the supporter's
 *   proof so the tx source account does not link back to them.
 * - reads (`getWall`, `getTally`, `isNullifierUsed`, `getDepositLeaves`) are
 *   simulations.
 *
 * Deposit is NOT here: supporters sign it client-side via Freighter (see
 * ./deposit.ts), so the pool pulls their USDC directly.
 *
 * No bb.js here: the Merkle path is rebuilt on the client (see ./merkle.ts);
 * this module only returns the raw leaf list.
 */

function getContractId(): string {
  const id = process.env.PATRONAGE_CONTRACT_ID;
  if (!id) throw new Error("PATRONAGE_CONTRACT_ID is not set in env");
  return id;
}

export type AnonMessage = { message: string; tier: bigint; timestamp: bigint };

function bytesScVal(bytes: Uint8Array): xdr.ScVal {
  return nativeToScVal(Buffer.from(bytes), { type: "bytes" });
}

function i128ScVal(v: bigint): xdr.ScVal {
  return nativeToScVal(v, { type: "i128" });
}

function u32ScVal(v: number): xdr.ScVal {
  return nativeToScVal(v, { type: "u32" });
}

// ── Admin writes ──────────────────────────────────────────────────────────────

/** Map a creator field to its payout wallet so withdrawals can pay it. */
export async function registerPayout(
  creator: bigint,
  wallet: string,
): Promise<SendResult> {
  return submitWithRetry(
    getContractId(),
    "register_payout",
    [bytesScVal(fieldToBytes32(creator)), new Address(wallet).toScVal()],
    "patronage",
  );
}

/** Open a poll for a creator with `options` choices (0..options-1). */
export async function createPoll(
  creator: bigint,
  pollId: number,
  options: number,
): Promise<SendResult> {
  return submitWithRetry(
    getContractId(),
    "create_poll",
    [bytesScVal(fieldToBytes32(creator)), u32ScVal(pollId), u32ScVal(options)],
    "patronage",
  );
}

// ── Relayed writes ────────────────────────────────────────────────────────────

/** Relay a private withdrawal: verify proof on-chain, pay the creator. */
export async function submitWithdraw(
  publicInputs: Uint8Array,
  proof: Uint8Array,
): Promise<SendResult> {
  return submitWithRetry(
    getContractId(),
    "withdraw",
    [bytesScVal(publicInputs), bytesScVal(proof)],
    "patronage",
  );
}

/** Relay an anonymous post: verify proof on-chain, record the message. */
export async function submitPost(
  publicInputs: Uint8Array,
  proof: Uint8Array,
  message: string,
): Promise<SendResult> {
  const msgBytes = new TextEncoder().encode(message);
  return submitWithRetry(
    getContractId(),
    "post",
    [bytesScVal(publicInputs), bytesScVal(proof), bytesScVal(msgBytes)],
    "patronage",
  );
}

/** Relay an anonymous vote: verify proof on-chain, increment the tally. */
export async function submitVote(
  publicInputs: Uint8Array,
  proof: Uint8Array,
  choice: number,
): Promise<SendResult> {
  return submitWithRetry(
    getContractId(),
    "vote",
    [bytesScVal(publicInputs), bytesScVal(proof), u32ScVal(choice)],
    "patronage",
  );
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** True if this nullifier hash has already been spent on-chain. */
export async function isNullifierUsed(nullifierHash: bigint): Promise<boolean> {
  const raw = await simulateRead(getContractId(), "is_nullifier_used", [
    bytesScVal(fieldToBytes32(nullifierHash)),
  ]);
  return raw === true;
}

export async function getWall(creator: bigint): Promise<AnonMessage[]> {
  const raw = (await simulateRead(getContractId(), "get_wall", [
    bytesScVal(fieldToBytes32(creator)),
  ])) as Array<{ message: Uint8Array; tier: bigint; timestamp: bigint }> | null;
  if (!raw) return [];
  return raw.map((m) => ({
    message: new TextDecoder().decode(m.message),
    tier: m.tier,
    timestamp: m.timestamp,
  }));
}

/** Vote counts for a poll, indexed by choice. */
export async function getTally(
  creator: bigint,
  pollId: number,
): Promise<number[]> {
  const raw = (await simulateRead(getContractId(), "get_tally", [
    bytesScVal(fieldToBytes32(creator)),
    u32ScVal(pollId),
  ])) as Array<number | bigint> | null;
  if (!raw) return [];
  return raw.map((n) => Number(n));
}

/**
 * Ordered list of leaf commitments for a tier, via `get_leaves`. Reliable (a
 * simulation read) — does not depend on RPC event retention.
 */
export async function getDepositLeaves(tier: bigint): Promise<bigint[]> {
  const raw = (await simulateRead(getContractId(), "get_leaves", [
    i128ScVal(tier),
  ])) as Uint8Array[] | null;
  if (!raw) return [];
  return raw.map((b) => bytes32ToField(b));
}
