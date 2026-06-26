import "server-only";
import {
  BASE_FEE,
  Contract,
  type Keypair,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk";
import { deriveKeypairFromMnemonic } from "./hd-wallet";

/**
 * Shared server-side Soroban transaction helpers.
 *
 * The server signs contract invocations with a keypair derived from
 * TEST_MNEMONIC + SERVER_ACCOUNT_INDEX. Used by every server-only contract
 * client (TipJar, Patronage, …) so the build/sign/send/poll + simulate logic
 * lives in one place. The contract id is passed per call.
 */

const NETWORK_PASSPHRASE = Networks.TESTNET;
const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SendResult =
  | { ok: true; hash: string }
  | { ok: false; error: string };

let _serverKeypair: Keypair | null = null;

export async function getServerKeypair(): Promise<Keypair> {
  if (_serverKeypair) return _serverKeypair;
  const mnemonic = process.env.TEST_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "TEST_MNEMONIC is not set. The server needs a mnemonic to derive its signing key.",
    );
  }
  const accountIndex = Number.parseInt(
    process.env.SERVER_ACCOUNT_INDEX ?? "2",
    10,
  );
  _serverKeypair = await deriveKeypairFromMnemonic(mnemonic, accountIndex);
  return _serverKeypair;
}

export function getRpcClient(): rpc.Server {
  return new rpc.Server(
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? DEFAULT_RPC_URL,
  );
}

/** Poll until the transaction reaches a terminal state or times out. */
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

/** Build + simulate + sign + submit a single contract invocation. */
export async function submitContractInvoke(
  contractId: string,
  fn: string,
  args: xdr.ScVal[],
): Promise<SendResult> {
  const kp = await getServerKeypair();
  const rpcServer = getRpcClient();
  const source = await rpcServer.getAccount(kp.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(fn, ...args))
    .setTimeout(60)
    .build();

  const prepared = await rpcServer.prepareTransaction(tx);
  prepared.sign(kp);

  const sendRes = await rpcServer.sendTransaction(prepared);
  if (sendRes.status !== "PENDING") {
    return {
      ok: false,
      error: `send failed: ${sendRes.status} ${JSON.stringify(sendRes.errorResult ?? {})}`,
    };
  }
  return pollTransactionResult(rpcServer, sendRes.hash);
}

/** Submit with fixed-delay retries. `label` prefixes the warning logs. */
export async function submitWithRetry(
  contractId: string,
  fn: string,
  args: xdr.ScVal[],
  label: string,
  retries = 3,
  delayMs = 2000,
): Promise<SendResult> {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await submitContractInvoke(contractId, fn, args);
      if (r.ok) return r;
      lastError = r.error;
    } catch (err) {
      lastError = (err as Error).message ?? "unknown";
    }
    console.warn(
      `[${label}] ${fn} attempt ${attempt}/${retries}: ${lastError}`,
    );
    if (attempt < retries) await sleep(delayMs);
  }
  return {
    ok: false,
    error: `${fn} failed after ${retries} attempts: ${lastError}`,
  };
}

/**
 * Read-only contract call (simulation, no submission). Returns the decoded
 * native value, or null if there is no return value.
 */
export async function simulateRead(
  contractId: string,
  fn: string,
  args: xdr.ScVal[],
): Promise<unknown> {
  const rpcServer = getRpcClient();
  const kp = await getServerKeypair();
  const source = await rpcServer.getAccount(kp.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(fn, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`${fn} sim failed: ${sim.error}`);
  }
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) return null;
  return scValToNative(sim.result.retval);
}
