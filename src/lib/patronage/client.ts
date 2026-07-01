/**
 * Browser-side proving for private patronage.
 *
 * Pipeline: generate a secret note at deposit time -> later build an UltraHonk
 * proof that the note's commitment is in the tier tree for a creator, for one of
 * three single-use actions (withdraw / message / vote).
 *
 * Uses @noir-lang/noir_js (witness) + @aztec/bb.js (UltraHonk proof, keccak
 * oracle to match the on-chain verifier). The compiled circuit ships as JSON.
 * Poseidon (./poseidon.ts) is bb.js and verified to match the circuit; the
 * pinned versions (noir_js 1.0.0-beta.9, bb.js 0.87.0) match nargo + bb.
 */
import type { CompiledCircuit } from "@noir-lang/noir_js";
import {
  bytesToHex,
  creatorField,
  DOMAIN,
  fieldToBytes32,
  messageHashField,
  modR,
  recipientField,
} from "./fields";
import { commitment, nullifierHash } from "./poseidon";

export type DepositNote = {
  /** secret + nullifier are the supporter's private material. Keep them safe. */
  secret: string; // decimal field
  nullifier: string; // decimal field
  slug: string;
  /** deposit tier in USDC stroops (decimal string). Bound into the commitment. */
  tier: string;
  /** filled in after deposit settles (leaf index in the tier tree). */
  leafIndex?: number;
};

/** Cryptographically-random BN254 field element. */
function randomField(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return modR(v);
}

/**
 * Create a deposit note + the commitment to send on-chain at deposit time.
 * The pool never sees secret/nullifier.
 */
export async function buildDepositNote(
  slug: string,
  tier: bigint,
): Promise<{ note: DepositNote; commitmentHex: string }> {
  const secret = randomField();
  const nullifier = randomField();
  const c = await commitment(nullifier, secret, creatorField(slug), tier);
  return {
    note: {
      secret: secret.toString(),
      nullifier: nullifier.toString(),
      slug,
      tier: tier.toString(),
    },
    commitmentHex: bytesToHex(fieldToBytes32(c)),
  };
}

export type ProofResult = {
  /** raw UltraHonk proof bytes, hex */
  proofHex: string;
  /** 224-byte public inputs (7 fields), hex */
  publicInputsHex: string;
};

type MerklePath = { siblings: string[]; bits: number[]; root: string };

/**
 * Generate a membership proof for one of the unified actions.
 *
 * Public inputs order: [root, nullifier_hash, creator, tier, domain, sub_id,
 * action_data] — must match the circuit and the contract's positional parse.
 */
async function generateProof(
  note: DepositNote,
  action: { domain: bigint; subId: bigint; actionData: bigint },
  path: MerklePath,
): Promise<ProofResult> {
  // Lazy imports keep these heavy wasm deps out of the initial bundle.
  const { Noir } = await import("@noir-lang/noir_js");
  const { UltraHonkBackend } = await import("@aztec/bb.js");
  const circuit = (
    await import("../../../circuits/patronage/target/glint_patronage.json")
  ).default as unknown as CompiledCircuit;

  const nullifier = BigInt(note.nullifier);
  const creator = creatorField(note.slug);
  const tier = BigInt(note.tier);
  const nf = await nullifierHash(nullifier, action.domain, action.subId);

  const inputs = {
    root: path.root,
    nullifier_hash: nf.toString(),
    creator: creator.toString(),
    tier: tier.toString(),
    domain: action.domain.toString(),
    sub_id: action.subId.toString(),
    action_data: action.actionData.toString(),
    nullifier: note.nullifier,
    secret: note.secret,
    path_siblings: path.siblings,
    path_bits: path.bits.map((b) => b.toString()),
  };

  const noir = new Noir(circuit);
  const { witness } = await noir.execute(inputs);
  const backend = new UltraHonkBackend(circuit.bytecode, { threads: 1 });
  const { proof } = await backend.generateProof(witness, { keccak: true });

  // Assemble the 224-byte public-inputs blob in the circuit's declared order.
  const order = [
    BigInt(path.root),
    nf,
    creator,
    tier,
    action.domain,
    action.subId,
    action.actionData,
  ];
  const pub = new Uint8Array(order.length * 32);
  order.forEach((f, i) => {
    pub.set(fieldToBytes32(f), i * 32);
  });

  return { proofHex: bytesToHex(proof), publicInputsHex: bytesToHex(pub) };
}

/**
 * Proof for a private withdrawal (pays `recipient` the tier amount). The
 * recipient is bound via action_data so a relayer cannot redirect the payout.
 */
export function generateWithdrawProof(
  note: DepositNote,
  recipient: string,
  path: MerklePath,
): Promise<ProofResult> {
  return generateProof(
    note,
    {
      domain: DOMAIN.WITHDRAW,
      subId: 0n,
      actionData: recipientField(recipient),
    },
    path,
  );
}

/** Proof for an anonymous wall message (binds msg_hash as action_data). */
export function generateMessageProof(
  note: DepositNote,
  message: string,
  path: MerklePath,
): Promise<ProofResult> {
  return generateProof(
    note,
    {
      domain: DOMAIN.MESSAGE,
      subId: 0n,
      actionData: messageHashField(message),
    },
    path,
  );
}

/** Proof for an anonymous vote (sub_id = poll, action_data = choice). */
export function generateVoteProof(
  note: DepositNote,
  pollId: number,
  choice: number,
  path: MerklePath,
): Promise<ProofResult> {
  return generateProof(
    note,
    { domain: DOMAIN.VOTE, subId: BigInt(pollId), actionData: BigInt(choice) },
    path,
  );
}
