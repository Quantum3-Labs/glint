/**
 * Browser-side proving for anonymous patronage.
 *
 * Pipeline: generate a secret note at tip time -> later build an UltraHonk proof
 * that the note's commitment is in the pool tree for a creator, and post an
 * anonymous message.
 *
 * Uses @noir-lang/noir_js (witness) + @aztec/bb.js (UltraHonk proof, keccak
 * oracle to match the on-chain verifier). The compiled circuit ships as JSON.
 *
 * INTEGRATION TODO:
 *   - Configure the Poseidon backend (see ./poseidon.ts) before calling
 *     `buildDepositNote` / proving — commitments must match the circuit.
 *   - Confirm @noir-lang/noir_js + @aztec/bb.js versions match nargo 1.0.0-beta.9
 *     + bb 0.87.0, and that `{ keccak: true }` is the right flag for this bb.
 */
import type { CompiledCircuit } from "@noir-lang/noir_js";
import {
  bytesToHex,
  creatorField,
  fieldToBytes32,
  messageHashField,
  modR,
} from "./fields";
import { commitment, nullifierHash } from "./poseidon";

export type DepositNote = {
  /** secret + nullifier are the supporter's private material. Keep them safe. */
  secret: string; // decimal field
  nullifier: string; // decimal field
  slug: string;
  /** filled in after deposit settles (leaf index in the global tree). */
  leafIndex?: number;
};

/** Cryptographically-random BN254 field element as a decimal string. */
function randomField(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return modR(v);
}

/**
 * Create a deposit note + the commitment to send to the server at tip time.
 * The server never sees secret/nullifier.
 */
export async function buildDepositNote(slug: string): Promise<{
  note: DepositNote;
  commitmentHex: string;
}> {
  const secret = randomField();
  const nullifier = randomField();
  const c = await commitment(nullifier, secret, creatorField(slug));
  return {
    note: { secret: secret.toString(), nullifier: nullifier.toString(), slug },
    commitmentHex: bytesToHex(fieldToBytes32(c)),
  };
}

export type ProofResult = {
  /** raw UltraHonk proof bytes, hex */
  proofHex: string;
  /** 128-byte public inputs [root, nullifier_hash, creator, msg_hash], hex */
  publicInputsHex: string;
};

/**
 * Generate the membership proof for an anonymous post.
 *
 * @param note     the supporter's deposit note
 * @param message  the message to post (bound via msg_hash)
 * @param path     siblings + bits + root from /api/patronage/path
 */
export async function generatePostProof(
  note: DepositNote,
  message: string,
  path: { siblings: string[]; bits: number[]; root: string },
): Promise<ProofResult> {
  // Lazy imports keep these heavy wasm deps out of the initial bundle.
  const { Noir } = await import("@noir-lang/noir_js");
  const { UltraHonkBackend } = await import("@aztec/bb.js");
  const circuit = (
    await import("../../../circuits/patronage/target/glint_patronage.json")
  ).default as unknown as CompiledCircuit;

  const nullifier = BigInt(note.nullifier);
  const creator = creatorField(note.slug);
  const nf = await nullifierHash(nullifier);
  const msgHash = messageHashField(message);

  const inputs = {
    root: path.root,
    nullifier_hash: nf.toString(),
    creator: creator.toString(),
    msg_hash: msgHash.toString(),
    nullifier: note.nullifier,
    secret: note.secret,
    path_siblings: path.siblings,
    path_bits: path.bits.map((b) => b.toString()),
  };

  const noir = new Noir(circuit);
  const { witness } = await noir.execute(inputs);
  const backend = new UltraHonkBackend(circuit.bytecode, { threads: 1 });
  const { proof } = await backend.generateProof(witness, { keccak: true });

  // Assemble the 128-byte public-inputs blob in the circuit's declared order.
  const order = [path.root, nf, creator, msgHash];
  const pub = new Uint8Array(128);
  order.forEach((f, i) => {
    pub.set(fieldToBytes32(typeof f === "string" ? BigInt(f) : f), i * 32);
  });

  return { proofHex: bytesToHex(proof), publicInputsHex: bytesToHex(pub) };
}
