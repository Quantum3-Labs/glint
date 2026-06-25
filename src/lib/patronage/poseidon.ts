import { modR } from "./fields";

/**
 * Poseidon2 over BN254, backed by @aztec/bb.js (Barretenberg).
 *
 * Barretenberg's `poseidon2Hash` is byte-for-byte identical to the Noir circuit
 * (`dep::poseidon::poseidon2`) and the on-chain `soroban_poseidon::poseidon2_hash`.
 * Verified against circuit-produced vectors in `scripts/poseidon-check.ts`:
 *   hash2(1,2)   = 1594597865669602199208529098208508950092942746041644072252494753744672355203
 *   hash3(1,2,3) = 16068223842875184682212183064520144190817798559788034419026031423767658184152
 *   hash2(0,0)   = 5151499478991301833156025595048985053689893395646836724335623777508747990769
 *
 * Works in both Node (server) and the browser. The wasm instance is created once
 * and reused. All hashing is therefore async.
 */

// biome-ignore lint/suspicious/noExplicitAny: bb.js Barretenberg type loaded dynamically
let _bb: Promise<any> | null = null;

async function getBb(): Promise<unknown> {
  if (!_bb) {
    _bb = (async () => {
      const { Barretenberg } = await import("@aztec/bb.js");
      return Barretenberg.new();
    })();
  }
  return _bb;
}

async function hash(inputs: bigint[]): Promise<bigint> {
  const { Fr } = await import("@aztec/bb.js");
  // biome-ignore lint/suspicious/noExplicitAny: dynamic bb.js instance
  const bb = (await getBb()) as any;
  const out = await bb.poseidon2Hash(inputs.map((v) => new Fr(modR(v))));
  return modR(BigInt(out.toString()));
}

/** Commitment = Poseidon2([nullifier, secret, creator]). */
export function commitment(
  nullifier: bigint,
  secret: bigint,
  creator: bigint,
): Promise<bigint> {
  return hash([nullifier, secret, creator]);
}

/** nullifier_hash = Poseidon2([nullifier, 0]). */
export function nullifierHash(nullifier: bigint): Promise<bigint> {
  return hash([nullifier, 0n]);
}

/** Merkle 2-to-1 node hash, matching the on-chain frontier tree. */
export function merkleHash2(left: bigint, right: bigint): Promise<bigint> {
  return hash([left, right]);
}
