/**
 * End-to-end validation of anonymous patronage against live testnet.
 *
 * Drives the real crypto pipeline (bb.js Poseidon + UltraHonk proof) and posts
 * on-chain via the stellar CLI (source `alice`, the deploy admin/relayer):
 *   commitment -> deposit -> Merkle path -> proof -> post -> read wall.
 *
 * Run: PATRONAGE=<id> npx tsx scripts/patronage-e2e.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bytesToHex,
  creatorField,
  fieldToBytes32,
  messageHashField,
  modR,
} from "../src/lib/patronage/fields";
import {
  commitment,
  merkleHash2,
  nullifierHash,
} from "../src/lib/patronage/poseidon";

const VERIFIER = "CBQRARZTFSB5VZD55UBCY4F2BH34QZ3A6AOBVNS2I2I6Y5QE6USYQTLJ";
const WASM = "contracts/patronage/target/wasm32v1-none/release/patronage.wasm";
const NET = "testnet";
const SLUG = `e2e-${Date.now()}`;
const MESSAGE = "gm — verified anonymous supporter";
const TREE_DEPTH = 20;
const dir = mkdtempSync(join(tmpdir(), "patronage-e2e-"));

function stellar(args: string[]): string {
  return execFileSync("stellar", args, { encoding: "utf8" }).trim();
}
function fileArg(name: string, bytes: Uint8Array): string[] {
  const p = join(dir, name);
  writeFileSync(p, Buffer.from(bytes));
  return [`--${name.replace(/\..*$/, "")}-file-path`, p];
}

async function main() {
  const rand = () => {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    let v = 0n;
    for (const x of b) v = (v << 8n) | BigInt(x);
    return modR(v);
  };

  // 0. fresh pool (empty tree -> our deposit lands at leaf index 0)
  const alice = stellar(["keys", "address", "alice"]);
  const pool = stellar([
    "contract",
    "deploy",
    "--wasm",
    WASM,
    "--source",
    "alice",
    "--network",
    NET,
    "--",
    "--admin",
    alice,
    "--verifier",
    VERIFIER,
  ]);
  console.log("fresh pool:", pool);

  // 1. note + commitment
  const secret = rand();
  const nullifier = rand();
  const creator = creatorField(SLUG);
  const c = await commitment(nullifier, secret, creator);
  console.log("commitment:", bytesToHex(fieldToBytes32(c)));

  // 2. deposit
  console.log("\n[deposit]");
  console.log(
    stellar([
      "contract",
      "invoke",
      "--id",
      pool,
      "--source",
      "alice",
      "--network",
      NET,
      "--send",
      "yes",
      "--",
      "deposit",
      ...fileArg("commitment", fieldToBytes32(c)),
    ]),
  );

  // 3. Merkle path for the single leaf at index 0 (zero-subtree siblings)
  const z: bigint[] = [0n];
  for (let i = 0; i < TREE_DEPTH; i++) z.push(await merkleHash2(z[i], z[i]));
  let root = c;
  for (let i = 0; i < TREE_DEPTH; i++) root = await merkleHash2(root, z[i]);
  const onchainRoot = stellar([
    "contract",
    "invoke",
    "--id",
    pool,
    "--source",
    "alice",
    "--network",
    NET,
    "--",
    "get_root",
  ]).replace(/"/g, "");
  console.log("\ncomputed root:", root.toString(16));
  console.log(
    "on-chain root:",
    onchainRoot,
    "(hex match:",
    onchainRoot === bytesToHex(fieldToBytes32(root)),
    ")",
  );

  // 4. proof
  console.log("\n[proof]");
  const nf = await nullifierHash(nullifier);
  const msgHash = messageHashField(MESSAGE);
  const { Noir } = await import("@noir-lang/noir_js");
  const { UltraHonkBackend } = await import("@aztec/bb.js");
  const circuit = (
    await import("../circuits/patronage/target/glint_patronage.json")
  ).default as unknown as { bytecode: string };
  const noir = new Noir(circuit as never);
  const { witness } = await noir.execute({
    root: root.toString(),
    nullifier_hash: nf.toString(),
    creator: creator.toString(),
    msg_hash: msgHash.toString(),
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    path_siblings: z.slice(0, TREE_DEPTH).map((s) => s.toString()),
    path_bits: Array(TREE_DEPTH).fill("0"),
  });
  const backend = new UltraHonkBackend(circuit.bytecode, { threads: 1 });
  const { proof } = await backend.generateProof(witness, { keccak: true });
  console.log("proof bytes:", proof.length);

  const pub = new Uint8Array(128);
  [root, nf, creator, msgHash].forEach((f, i) => {
    pub.set(fieldToBytes32(f), i * 32);
  });

  // 5. post
  console.log("\n[post]");
  console.log(
    stellar([
      "contract",
      "invoke",
      "--id",
      pool,
      "--source",
      "alice",
      "--network",
      NET,
      "--send",
      "yes",
      "--",
      "post",
      ...fileArg("public_inputs", pub),
      ...fileArg("proof_bytes", proof),
      ...fileArg("message", new TextEncoder().encode(MESSAGE)),
    ]),
  );

  // 6. read wall
  console.log("\n[wall]");
  console.log(
    stellar([
      "contract",
      "invoke",
      "--id",
      pool,
      "--source",
      "alice",
      "--network",
      NET,
      "--",
      "get_wall",
      ...fileArg("creator", fieldToBytes32(creator)),
    ]),
  );
  console.log("\nE2E OK");
}
main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
