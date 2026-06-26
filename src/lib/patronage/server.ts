import "server-only";
import { nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { type SendResult, simulateRead, submitWithRetry } from "../soroban-tx";
import { bytes32ToField, fieldToBytes32 } from "./fields";

/**
 * Patronage pool contract client (server-side / relayer).
 *
 * - `deposit` is admin-gated: signed with the server keypair after a tip settles.
 * - `post` is open: the server relays the supporter's proof so the tx source
 *   account does not link back to them.
 * - reads (`getWall`, `isNullifierUsed`, `getDepositLeaves`) are simulations.
 *
 * No bb.js here: the Merkle path is rebuilt on the client (see ./merkle.ts);
 * this module only returns the raw leaf list. Soroban build/sign/send/poll +
 * simulate live in `../soroban-tx`.
 */

function getContractId(): string {
  const id = process.env.PATRONAGE_CONTRACT_ID;
  if (!id) throw new Error("PATRONAGE_CONTRACT_ID is not set in env");
  return id;
}

export type AnonMessage = { message: string; timestamp: bigint };

function bytesScVal(bytes: Uint8Array): xdr.ScVal {
  return nativeToScVal(Buffer.from(bytes), { type: "bytes" });
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** Append a supporter's commitment after their tip settles. Admin-signed. */
export async function depositCommitment(
  commitment: bigint,
): Promise<SendResult> {
  return submitWithRetry(
    getContractId(),
    "deposit",
    [bytesScVal(fieldToBytes32(commitment))],
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

// ── Reads ───────────────────────────────────────────────────────────────────

/** True if this nullifier hash has already been spent on-chain (note used up). */
export async function isNullifierUsed(nullifierHash: bigint): Promise<boolean> {
  const raw = await simulateRead(getContractId(), "is_nullifier_used", [
    bytesScVal(fieldToBytes32(nullifierHash)),
  ]);
  return raw === true;
}

export async function getWall(creator: bigint): Promise<AnonMessage[]> {
  const raw = (await simulateRead(getContractId(), "get_wall", [
    bytesScVal(fieldToBytes32(creator)),
  ])) as Array<{ message: Uint8Array; timestamp: bigint }> | null;
  if (!raw) return [];
  return raw.map((m) => ({
    message: new TextDecoder().decode(m.message),
    timestamp: m.timestamp,
  }));
}

/**
 * Ordered list of leaf commitments, read from contract storage via `get_leaves`.
 * Reliable (a simulation read) — does not depend on RPC event retention, which
 * on the public testnet RPC prunes events beyond a small ledger window.
 */
export async function getDepositLeaves(): Promise<bigint[]> {
  const raw = (await simulateRead(getContractId(), "get_leaves", [])) as
    | Uint8Array[]
    | null;
  if (!raw) return [];
  return raw.map((b) => bytes32ToField(b));
}
