// Glint private patronage circuit (unified).
//
// One circuit serves every anonymous action a supporter can take from a single
// deposit: WITHDRAW (private payment to the creator), MESSAGE (anonymous wall
// post), and VOTE (anonymous poll vote). A `domain` separates the nullifiers so
// each action is independently single-use off one deposit.
//
// Statement proved (without revealing which wallet or deposit was theirs):
//
//   "I know the secret behind a commitment that
//      (a) is a member of the tier-`tier` Merkle tree with root `root`, and
//      (b) was deposited for creator `creator`,
//    and here is the single-use `nullifier_hash` for action `domain`/`sub_id`,
//    bound to `action_data`."
//
// Design notes (read before changing):
//
// * TIER POOLS. Each fixed denomination has its own Merkle tree. `tier` is bound
//   into the commitment AND exposed as a public input, so a proof built for a
//   $1 deposit cannot be replayed to withdraw a $10 payout. The contract checks
//   `root` against the known roots of that tier's tree and pays `tier`'s amount.
//
// * DOMAIN-SEPARATED NULLIFIERS. nullifier_hash = H(nullifier, domain, sub_id).
//   - WITHDRAW: domain=1, sub_id=0  -> one private payment per deposit.
//   - MESSAGE:  domain=2, sub_id=0  -> one anonymous message per deposit.
//   - VOTE:     domain=3, sub_id=poll_id -> one vote per (deposit, poll).
//   Different domains yield different nullifiers, so the same deposit can do all
//   three, each exactly once.
//
// * ACTION BINDING. `action_data` is a public input the contract interprets per
//   domain (recipient for WITHDRAW, msg_hash for MESSAGE, vote choice for VOTE).
//   The circuit only keeps it bound into the proof so a relayer cannot swap it;
//   the semantic check happens on-chain.

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
    tier: pub Field,
    domain: pub Field,
    sub_id: pub Field,
    action_data: pub Field,
    // --- private inputs ---
    nullifier: Field,
    secret: Field,
    path_siblings: [Field; 20],
    path_bits: [Field; 20],
) {
    // Commitment binds the supporter's secret to the creator and tier they backed.
    let leaf = Poseidon2::hash([nullifier, secret, creator, tier], 4);

    // Per-action nullifier: H(nullifier, domain, sub_id).
    let nf = Poseidon2::hash([nullifier, domain, sub_id], 3);
    assert(nf == nullifier_hash);

    // Membership: the commitment is in the tier tree with the given root.
    let computed_root = compute_root(leaf, path_siblings, path_bits);
    assert(computed_root == root);

    // Keep `action_data` bound into the proof so the compiler cannot prune it.
    // The semantic check (recipient / msg_hash / choice) happens on-chain.
    let bind = action_data * action_data;
    assert(bind == action_data * action_data);
}
