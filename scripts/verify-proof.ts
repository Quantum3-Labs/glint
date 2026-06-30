/**
 * USDC-free de-risk: prove the new unified circuit and verify the proof on the
 * freshly deployed verifier. Exercises the highest-risk new pieces without
 * touching the pool / USDC:
 *   - 4-input commitment Poseidon (bb.js == Noir): witness generation asserts
 *     the circuit's leaf == the bb.js commitment via the Merkle root check.
 *   - 7 public inputs layout + keccak oracle + new VK on the new verifier.
 *
 * Run: npx tsx scripts/verify-proof.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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

const VERIFIER = "CDIXM6HS6FYPHYHPE52FHKWO7RPJRL3DIK5KJZG5AJR27XNETDBDK3BC";
const NET = "testnet";
const TREE_DEPTH = 20;
const TIER = 10_000_000n; // $1
const MESSAGE = "gm — verified anonymous supporter";
const dir = mkdtempSync(join(tmpdir(), "verify-proof-"));

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

  const secret = rand();
  const nullifier = rand();
  const creator = creatorField("verify-proof-demo");
  const c = await commitment(nullifier, secret, creator, TIER);

  // Single leaf at index 0: root = hash up the zero-subtree (bb.js Merkle).
  const z: bigint[] = [0n];
  for (let i = 0; i < TREE_DEPTH; i++) z.push(await merkleHash2(z[i], z[i]));
  let root = c;
  for (let i = 0; i < TREE_DEPTH; i++) root = await merkleHash2(root, z[i]);

  const nf = await nullifierHash(nullifier, DOMAIN.MESSAGE, 0n);
  const msgHash = messageHashField(MESSAGE);

  const { Noir } = await import("@noir-lang/noir_js");
  const { UltraHonkBackend } = await import("@aztec/bb.js");
  const circuit = (
    await import("../circuits/patronage/target/glint_patronage.json")
  ).default as unknown as { bytecode: string };
  const noir = new Noir(circuit as never);
  // If the bb.js 4-input commitment != the circuit's Noir leaf, this throws
  // (the in-circuit `computed_root == root` assertion fails).
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
  console.log("witness OK -> 4-input commitment matches (bb.js == Noir)");

  const backend = new UltraHonkBackend(circuit.bytecode, { threads: 1 });
  const { proof } = await backend.generateProof(witness, { keccak: true });
  console.log("proof bytes:", proof.length);

  const pub = new Uint8Array(7 * 32);
  [root, nf, creator, TIER, DOMAIN.MESSAGE, 0n, msgHash].forEach((f, i) => {
    pub.set(fieldToBytes32(f), i * 32);
  });

  console.log("\n[verify_proof on new verifier]");
  console.log(
    execFileSync(
      "stellar",
      [
        "contract",
        "invoke",
        "--id",
        VERIFIER,
        "--source",
        "alice",
        "--network",
        NET,
        "--",
        "verify_proof",
        ...fileArg("public_inputs", pub),
        ...fileArg("proof_bytes", proof),
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  console.log("\nVERIFY OK");
}
main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
