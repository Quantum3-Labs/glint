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
  DOMAIN,
  fieldToBytes32,
  messageHashField,
  modR,
} from "../src/lib/patronage/fields";
import {
  commitment,
  merkleHash2,
  nullifierHash,
} from "../src/lib/patronage/poseidon";

const VERIFIER = "CAQQYBTA2Q5GOFTL5VDZMM6UIPMOCGYKYSCN53UN63ESTTPWNBQOOPFI";
// USDC SAC the pool custodies. Override with USDC_SAC for your environment.
const TOKEN =
  process.env.USDC_SAC ??
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const WASM = "contracts/patronage/target/wasm32v1-none/release/patronage.wasm";
const NET = "testnet";
const SLUG = `e2e-${Date.now()}`;
const MESSAGE = "gm — verified anonymous supporter";
const TREE_DEPTH = 20;
const TIER = 10_000_000n; // $1 USDC (stroops)
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
    "--token",
    TOKEN,
  ]);
  console.log("fresh pool:", pool);

  // 1. note + commitment (tier is bound into the commitment)
  const secret = rand();
  const nullifier = rand();
  const creator = creatorField(SLUG);
  const c = await commitment(nullifier, secret, creator, TIER);
  console.log("commitment:", bytesToHex(fieldToBytes32(c)));

  // 2. deposit (alice signs the USDC transfer into the pool)
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
      "--from",
      alice,
      "--tier",
      TIER.toString(),
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
    "--tier",
    TIER.toString(),
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
  const nf = await nullifierHash(nullifier, DOMAIN.MESSAGE, 0n);
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
    tier: TIER.toString(),
    domain: DOMAIN.MESSAGE.toString(),
    sub_id: "0",
    action_data: msgHash.toString(),
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    path_siblings: z.slice(0, TREE_DEPTH).map((s) => s.toString()),
    path_bits: Array(TREE_DEPTH).fill("0"),
  });
  const backend = new UltraHonkBackend(circuit.bytecode, { threads: 1 });
  const { proof } = await backend.generateProof(witness, { keccak: true });
  console.log("proof bytes:", proof.length);

  // Public inputs: [root, nf, creator, tier, domain, sub_id, action_data].
  const pub = new Uint8Array(7 * 32);
  [root, nf, creator, TIER, DOMAIN.MESSAGE, 0n, msgHash].forEach((f, i) => {
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
