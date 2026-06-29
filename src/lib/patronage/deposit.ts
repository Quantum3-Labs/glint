"use client";

import {
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { signTxWithFreighter } from "../freighter";
import { NETWORK_PASSPHRASE } from "../stellar";
import { buildDepositNote } from "./client";
import { hexToBytes } from "./fields";
import { saveNote } from "./notes";

/**
 * Client-side deposit into the patronage pool.
 *
 * The supporter signs a Soroban invocation of `deposit(from, tier, commitment)`
 * with Freighter. The commitment is generated in the browser (so the pool never
 * learns the secret) and the matching note is saved to localStorage. The fixed
 * `tier` USDC is pulled into the pool by the contract — no x402, no server.
 *
 * `from` is the transaction source, so the contract's `from.require_auth()` (and
 * the inner token transfer's auth) are both satisfied by the single Freighter
 * signature on the transaction.
 */

/**
 * Pool config (contract id + RPC url) comes from the server at runtime, so we
 * never bake NEXT_PUBLIC_* into the client bundle (which breaks Cloud Run's
 * runtime env model).
 */
async function getConfig(): Promise<{ contractId: string; rpcUrl: string }> {
  const res = await fetch("/api/patronage/config");
  if (!res.ok) throw new Error("pool is not configured");
  return res.json();
}

export type DepositResult = { txHash: string; commitmentHex: string };

/**
 * Generate a note, sign + submit the deposit, and persist the note on success.
 *
 * @param slug    creator slug (bound into the commitment)
 * @param tier    deposit amount in USDC stroops (must be an allowed tier)
 * @param address connected Freighter address (the depositor / tx source)
 */
export async function depositToPool(
  slug: string,
  tier: bigint,
  address: string,
): Promise<DepositResult> {
  const { note, commitmentHex } = await buildDepositNote(slug, tier);

  const { contractId, rpcUrl } = await getConfig();
  const server = new rpc.Server(rpcUrl);
  const source = await server.getAccount(address);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "deposit",
        new Address(address).toScVal(),
        nativeToScVal(tier, { type: "i128" }),
        nativeToScVal(Buffer.from(hexToBytes(commitmentHex)), {
          type: "bytes",
        }),
      ),
    )
    .setTimeout(60)
    .build();

  // Simulate to attach Soroban auth + resource fees. The depositor's auth is
  // the source-account signature, so no separate auth-entry signing is needed.
  const prepared = await server.prepareTransaction(tx);

  const signed = await signTxWithFreighter(prepared.toXDR(), address);
  if (!signed.ok) throw new Error(signed.error);

  const signedTx = TransactionBuilder.fromXDR(signed.value, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(signedTx);
  if (sent.status !== "PENDING") {
    throw new Error(`deposit send failed: ${sent.status}`);
  }

  const hash = sent.hash;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await server.getTransaction(hash);
    if (res.status === "NOT_FOUND") continue;
    if (res.status === "SUCCESS") {
      // Persist only after the deposit settles, so we never store an unusable note.
      saveNote(note, commitmentHex);
      return { txHash: hash, commitmentHex };
    }
    if (res.status === "FAILED") {
      throw new Error("deposit transaction failed on-chain");
    }
  }
  throw new Error("deposit confirmation timed out");
}
