import "server-only";
import {
  BASE_FEE,
  Contract,
  type Keypair,
  Networks,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk";
import { deriveKeypairFromMnemonic } from "../hd-wallet";
import { bytes32ToField, fieldToBytes32 } from "./fields";
import { merkleHash2 } from "./poseidon";

/**
 * Patronage pool contract client (server-side / relayer).
 *
 * - `deposit` is admin-gated: signed with the server keypair after a tip settles.
 * - `post` is open: the server relays the supporter's proof so the tx source
 *   account does not link back to them.
 * - `getWall` / `getRoot` are read-only simulations.
 * - `buildMerklePath` rebuilds the tree off-chain (from deposit events) to give
 *   a supporter the siblings their proof needs. Depends on a validated Poseidon
 *   backend (see ./poseidon.ts).
 */

const NETWORK_PASSPHRASE = Networks.TESTNET;
const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const TREE_DEPTH = 20;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let _serverKeypair: Keypair | null = null;
async function getServerKeypair(): Promise<Keypair> {
  if (_serverKeypair) return _serverKeypair;
  const mnemonic = process.env.TEST_MNEMONIC;
  if (!mnemonic) throw new Error("TEST_MNEMONIC is not set.");
  const accountIndex = Number.parseInt(
    process.env.SERVER_ACCOUNT_INDEX ?? "2",
    10,
  );
  _serverKeypair = await deriveKeypairFromMnemonic(mnemonic, accountIndex);
  return _serverKeypair;
}

function getRpcClient(): rpc.Server {
  return new rpc.Server(
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? DEFAULT_RPC_URL,
  );
}

function getContractId(): string {
  const id = process.env.PATRONAGE_CONTRACT_ID;
  if (!id) throw new Error("PATRONAGE_CONTRACT_ID is not set in env");
  return id;
}

export type AnonMessage = { message: string; timestamp: bigint };
type SendResult = { ok: true; hash: string } | { ok: false; error: string };

function bytesScVal(bytes: Uint8Array): xdr.ScVal {
  return nativeToScVal(Buffer.from(bytes), { type: "bytes" });
}

async function pollTransactionResult(
  rpcServer: rpc.Server,
  hash: string,
): Promise<SendResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await rpcServer.getTransaction(hash);
    if (res.status === "NOT_FOUND") continue;
    if (res.status === "SUCCESS") return { ok: true, hash };
    if (res.status === "FAILED") {
      return {
        ok: false,
        error: `tx failed: ${JSON.stringify(res.resultXdr ?? {})}`,
      };
    }
  }
  return { ok: false, error: "tx polling timed out" };
}

async function submitInvoke(
  fn: string,
  args: xdr.ScVal[],
  sign: boolean,
): Promise<SendResult> {
  const kp = await getServerKeypair();
  const rpcServer = getRpcClient();
  const source = await rpcServer.getAccount(kp.publicKey());
  const contract = new Contract(getContractId());

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(fn, ...args))
    .setTimeout(60)
    .build();

  const prepared = await rpcServer.prepareTransaction(tx);
  prepared.sign(kp); // server signs (admin for deposit; relayer + fee payer for post)
  void sign;

  const sendRes = await rpcServer.sendTransaction(prepared);
  if (sendRes.status !== "PENDING") {
    return {
      ok: false,
      error: `send failed: ${sendRes.status} ${JSON.stringify(sendRes.errorResult ?? {})}`,
    };
  }
  return pollTransactionResult(rpcServer, sendRes.hash);
}

async function invokeWithRetry(
  fn: string,
  args: xdr.ScVal[],
): Promise<SendResult> {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await submitInvoke(fn, args, true);
      if (r.ok) return r;
      lastError = r.error;
    } catch (err) {
      lastError = (err as Error).message ?? "unknown";
    }
    console.warn(
      `[patronage] ${fn} attempt ${attempt}/${MAX_RETRIES}: ${lastError}`,
    );
    if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
  }
  return {
    ok: false,
    error: `${fn} failed after ${MAX_RETRIES} attempts: ${lastError}`,
  };
}

async function simulate(fn: string, args: xdr.ScVal[]): Promise<unknown> {
  const rpcServer = getRpcClient();
  const kp = await getServerKeypair();
  const source = await rpcServer.getAccount(kp.publicKey());
  const contract = new Contract(getContractId());
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(fn, ...args))
    .setTimeout(30)
    .build();
  const sim = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim))
    throw new Error(`${fn} sim failed: ${sim.error}`);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) return null;
  return scValToNative(sim.result.retval);
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** Append a supporter's commitment after their tip settles. Admin-signed. */
export async function depositCommitment(
  commitment: bigint,
): Promise<SendResult> {
  return invokeWithRetry("deposit", [bytesScVal(fieldToBytes32(commitment))]);
}

/** Relay an anonymous post: verify proof on-chain, record the message. */
export async function submitPost(
  publicInputs: Uint8Array,
  proof: Uint8Array,
  message: string,
): Promise<SendResult> {
  const msgBytes = new TextEncoder().encode(message);
  return invokeWithRetry("post", [
    bytesScVal(publicInputs),
    bytesScVal(proof),
    bytesScVal(msgBytes),
  ]);
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getRoot(): Promise<bigint | null> {
  const raw = (await simulate("get_root", [])) as Uint8Array | null;
  return raw ? bytes32ToField(raw) : null;
}

export async function getWall(creator: bigint): Promise<AnonMessage[]> {
  const raw = (await simulate("get_wall", [
    bytesScVal(fieldToBytes32(creator)),
  ])) as Array<{ message: Uint8Array; timestamp: bigint }> | null;
  if (!raw) return [];
  return raw.map((m) => ({
    message: new TextDecoder().decode(m.message),
    timestamp: m.timestamp,
  }));
}

// ── Merkle path (off-chain rebuild from on-chain leaf list) ──────────────────

/**
 * Ordered list of leaf commitments, read from contract storage via `get_leaves`.
 * Reliable (a simulation read) — does not depend on RPC event retention, which
 * on the public testnet RPC prunes events beyond a small ledger window.
 */
export async function getDepositLeaves(): Promise<bigint[]> {
  const raw = (await simulate("get_leaves", [])) as Uint8Array[] | null;
  if (!raw) return [];
  return raw.map((b) => bytes32ToField(b));
}

/** zero[0] = 0; zero[i+1] = H(zero[i], zero[i]). */
async function zeroes(): Promise<bigint[]> {
  const z: bigint[] = [0n];
  for (let i = 0; i < TREE_DEPTH; i++) z.push(await merkleHash2(z[i], z[i]));
  return z;
}

/**
 * Rebuild the tree from the leaf list and return the membership path for
 * `leafIndex`: the 20 sibling values and direction bits, plus the resulting root.
 */
export async function buildMerklePath(
  leaves: bigint[],
  leafIndex: number,
): Promise<{
  siblings: bigint[];
  bits: number[];
  root: bigint;
}> {
  const z = await zeroes();
  // level 0 = leaves padded with zero[0]
  let level = leaves.slice();
  const siblings: bigint[] = [];
  const bits: number[] = [];
  let idx = leafIndex;
  for (let d = 0; d < TREE_DEPTH; d++) {
    const isRight = idx & 1;
    const sibIdx = isRight ? idx - 1 : idx + 1;
    const sibling = sibIdx < level.length ? level[sibIdx] : z[d];
    siblings.push(sibling);
    bits.push(isRight);
    // build next level
    const next: bigint[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i];
      const r = i + 1 < level.length ? level[i + 1] : z[d];
      next.push(await merkleHash2(l, r));
    }
    level = next.length ? next : [z[d + 1]];
    idx >>= 1;
  }
  return { siblings, bits, root: level[0] ?? z[TREE_DEPTH] };
}
