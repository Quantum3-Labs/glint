// Glint anonymous patronage circuit.
//
// Statement proved by a supporter (the tipper), without revealing which wallet
// or which payment was theirs:
//
//   "I know the secret behind a commitment that
//      (a) is a member of the patronage Merkle tree with root `root`, and
//      (b) was deposited for creator `creator`,
//    and here is its single-use `nullifier_hash` and the `msg_hash` of the
//    message I am about to post."
//
// Design notes (read before changing):
//
// * GLOBAL POOL. Every tip (for any creator) is committed into one Merkle tree,
//   so the anonymity set is every depositor, not just this creator's. `creator`
//   is a PUBLIC input: we reveal *which* creator the support is for (that is not
//   secret) while hiding *who* sent it.
//
// * AMOUNT IS NOT IN THE COMMITMENT. The Glint server deposits the commitment
//   after settling the x402 payment, so it knows the real amount -- but it does
//   NOT know the secret, so it cannot check a hidden amount inside the leaf. A
//   client could therefore lie about a hidden amount. The honest way to support
//   a "tipped >= $X" claim is TIER POOLS: one tree per amount tier, and the
//   server deposits into the tier matching the real settled amount. "Tipped
//   >= $X to creator C" then becomes "membership in tier-X tree for creator C".
//   This scaffold models a single tier; `tier`/multi-tree is the next step.
//
// * MESSAGE BINDING. `msg_hash` is a public input. The contract recomputes
//   hash(message) on-chain and asserts it equals `msg_hash`, so a relayer cannot
//   swap the message. The circuit only needs to expose `msg_hash` and keep it
//   bound into the proof (see the no-op constraint below).

use dep::poseidon::poseidon2::Poseidon2;

global TREE_DEPTH: u32 = 20;

fn hash2(a: Field, b: Field) -> Field {
    Poseidon2::hash([a, b], 2)
}

fn constrain_bit(bit: Field) {
    assert(bit * (1 - bit) == 0);
}

// Frontier Merkle root, matching the on-chain contract:
//   zero[0] = 0; zero[i+1] = H(zero[i], zero[i]); H = Poseidon2 2-to-1.
fn compute_root(leaf: Field, path_siblings: [Field; 20], path_bits: [Field; 20]) -> Field {
    let mut cur = leaf;
    for i in 0..TREE_DEPTH {
        let sib = path_siblings[i];
        let bit = path_bits[i];
        constrain_bit(bit);
        if bit == 0 {
            cur = hash2(cur, sib);
        } else {
            cur = hash2(sib, cur);
        }
    }
    cur
}

pub fn main(
    // --- public inputs (order matters; the contract parses them positionally) ---
    root: pub Field,
    nullifier_hash: pub Field,
    creator: pub Field,
    msg_hash: pub Field,
    // --- private inputs ---
    nullifier: Field,
    secret: Field,
    path_siblings: [Field; 20],
    path_bits: [Field; 20],
) {
    // Commitment binds the supporter's secret to the creator they backed.
    let leaf = Poseidon2::hash([nullifier, secret, creator], 3);

    // One post per tip: nullifier_hash = H(nullifier, 0).
    let nf = hash2(nullifier, 0);
    assert(nf == nullifier_hash);

    // Membership: the commitment is in the tree with the given root.
    let computed_root = compute_root(leaf, path_siblings, path_bits);
    assert(computed_root == root);

    // Keep `msg_hash` bound into the proof so the compiler cannot prune it.
    // The actual message<->hash check happens on-chain in the contract.
    // TODO(scaffold): verify this survives Noir optimization (print the ABI /
    // public_inputs count) before relying on it for tamper-resistance.
    let bind = msg_hash * msg_hash;
    assert(bind == msg_hash * msg_hash);
}
