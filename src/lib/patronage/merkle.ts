import { merkleHash2 } from "./poseidon";

/**
 * Merkle-path rebuild, run in the BROWSER (the client already loads bb.js for
 * proving). Keeping it off the server means the API never runs bb.js wasm —
 * important for the standalone/Cloud Run build, where tracing the wasm files
 * and the memory cost are both fragile. The server only returns the raw leaf
 * list (a cheap simulation read).
 */

const TREE_DEPTH = 20;

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
): Promise<{ siblings: bigint[]; bits: number[]; root: bigint }> {
  const z = await zeroes();
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
