#![no_std]

//! # Glint Patronage Pool
//!
//! A Tornado-style privacy pool specialized for anonymous creator patronage.
//!
//! ## Flow
//!
//! 1. `deposit(commitment)` — called by the Glint server (admin) right after an
//!    x402 USDC tip settles. `commitment = Poseidon(nullifier, secret, creator)`
//!    is computed client-side, so the server never learns the supporter's secret.
//!    The commitment is appended to a single GLOBAL Poseidon Merkle tree.
//!
//! 2. `post(public_inputs, proof, message)` — anyone (typically a relayer) can
//!    submit a zero-knowledge proof that some commitment in the tree belongs to
//!    `creator`, together with a single-use `nullifier_hash`. If the proof
//!    verifies, an anonymous `message` is recorded on that creator's wall. The
//!    submitting account is unlinkable to the original tip.
//!
//! ## What this scaffold does NOT yet do (tracked, not hidden)
//!
//! - **Amount tiers.** The "tipped >= $X" claim needs one tree per amount tier,
//!   with the server depositing into the tier matching the settled amount. This
//!   contract models a single tier. See the circuit notes.
//! - **Bounded root history.** `KnownRoot` grows without eviction. A production
//!   build should keep only the last N roots.
//! - **Message-hash field reduction** must match the client exactly (see `post`).

extern crate alloc;
use alloc::vec::Vec as RustVec;

use soroban_poseidon::{poseidon2_hash, Field};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, crypto::BnScalar, Address,
    Bytes, BytesN, Env, IntoVal, InvokeError, Symbol, Val, Vec, U256,
};

/// Merkle tree depth. MUST match the Noir circuit's `TREE_DEPTH`.
const TREE_DEPTH: u32 = 20;
const MAX_LEAVES: u32 = 1u32 << TREE_DEPTH;

/// UltraHonk proof size in bytes (Nargo 1.0.0-beta.9 + bb 0.87.0). Public inputs
/// are 4 field elements: [root, nullifier_hash, creator, msg_hash] = 128 bytes.
const PUBLIC_INPUTS_LEN: u32 = 128;

/// Max anonymous message length (bytes). Matches the Glint server limit.
const MAX_MESSAGE_LEN: u32 = 280;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    CommitmentExists = 3,
    TreeFull = 4,
    NullifierUsed = 5,
    UnknownRoot = 6,
    VerificationFailed = 7,
    MessageTooLong = 8,
    InvalidPublicInputs = 9,
    MessageHashMismatch = 10,
}

#[contracttype]
#[derive(Clone)]
pub struct AnonMessage {
    /// Free-form anonymous note as raw UTF-8 bytes (the frontend decodes it).
    /// Bytes (not String) so the on-chain msg_hash check hashes exactly these
    /// bytes with no encoding ambiguity.
    pub message: Bytes,
    /// Ledger timestamp when the message was posted.
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Verifier,
    Root,
    NextIndex,
    Frontier(u32),
    KnownRoot(BytesN<32>),
    Commitment(BytesN<32>),
    Nullifier(BytesN<32>),
    /// Leaf commitment by insertion index. Lets clients rebuild the Merkle tree
    /// off-chain via a reliable read, instead of depending on event retention.
    Leaf(u32),
    /// Per-creator wall of anonymous messages, keyed by the creator field.
    Wall(BytesN<32>),
}

#[contractevent(topics = ["deposit"], data_format = "map")]
pub struct DepositEvent<'a> {
    #[topic]
    pub idx: &'a u32,
    pub commitment: &'a BytesN<32>,
}

#[contractevent(topics = ["post"], data_format = "single-value")]
pub struct PostEvent<'a> {
    pub nullifier_hash: &'a BytesN<32>,
}

#[contract]
pub struct Patronage;

// ---- Poseidon Merkle helpers (frontier-incremental, matches the circuit) ----

fn poseidon2_hash2(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let modulus = <BnScalar as Field>::modulus(env);
    let a_bytes = Bytes::from_array(env, &a.to_array());
    let b_bytes = Bytes::from_array(env, &b.to_array());
    let mut inputs = Vec::new(env);
    inputs.push_back(U256::from_be_bytes(env, &a_bytes).rem_euclid(&modulus));
    inputs.push_back(U256::from_be_bytes(env, &b_bytes).rem_euclid(&modulus));
    let out = poseidon2_hash::<4, BnScalar>(env, &inputs);
    let mut out_arr = [0u8; 32];
    out.to_be_bytes().copy_into_slice(&mut out_arr);
    BytesN::from_array(env, &out_arr)
}

/// zero[0] = 0; zero[i+1] = H(zero[i], zero[i]).
fn zeroes_for_tree(env: &Env) -> RustVec<BytesN<32>> {
    let mut zeroes = RustVec::with_capacity(TREE_DEPTH as usize + 1);
    let mut cur = BytesN::from_array(env, &[0u8; 32]);
    zeroes.push(cur.clone());
    for _ in 0..TREE_DEPTH {
        cur = poseidon2_hash2(env, &cur, &cur);
        zeroes.push(cur.clone());
    }
    zeroes
}

fn parse_public_inputs(bytes: &Bytes) -> Result<[[u8; 32]; 4], Error> {
    if bytes.len() != PUBLIC_INPUTS_LEN {
        return Err(Error::InvalidPublicInputs);
    }
    let mut buf = [0u8; 128];
    bytes.copy_into_slice(&mut buf);
    let mut out = [[0u8; 32]; 4];
    for i in 0..4 {
        out[i].copy_from_slice(&buf[i * 32..(i + 1) * 32]);
    }
    Ok(out)
}

/// keccak256(message) reduced mod the BN254 scalar field, big-endian. The client
/// MUST compute msg_hash the same way (keccak256 of the exact UTF-8 bytes, then
/// mod r) so the on-chain check passes.
fn message_hash_field(env: &Env, message: &Bytes) -> [u8; 32] {
    let digest = env.crypto().keccak256(message);
    let modulus = <BnScalar as Field>::modulus(env);
    let reduced = U256::from_be_bytes(env, &Bytes::from_array(env, &digest.to_array()))
        .rem_euclid(&modulus);
    let mut arr = [0u8; 32];
    reduced.to_be_bytes().copy_into_slice(&mut arr);
    arr
}

#[contractimpl]
impl Patronage {
    pub fn __constructor(env: Env, admin: Address, verifier: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        Ok(())
    }

    /// Append a commitment to the global tree. Admin-only: the Glint server calls
    /// this after an x402 tip settles, on the supporter's behalf.
    pub fn deposit(env: Env, commitment: BytesN<32>) -> Result<u32, Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let cm_key = DataKey::Commitment(commitment.clone());
        if env.storage().persistent().has(&cm_key) {
            return Err(Error::CommitmentExists);
        }

        let mut next_index: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextIndex)
            .unwrap_or(0u32);
        if next_index >= MAX_LEAVES {
            return Err(Error::TreeFull);
        }
        let idx = next_index;
        env.storage().persistent().set(&cm_key, &true);
        // Record the leaf by index for off-chain tree rebuilds.
        env.storage().persistent().set(&DataKey::Leaf(idx), &commitment);

        // Frontier-incremental insert (mirrors the circuit's compute_root).
        let zeroes = zeroes_for_tree(&env);
        let mut cur = commitment.clone();
        let mut i = 0u32;
        while i < TREE_DEPTH {
            let bit = (idx >> i) & 1;
            let fk = DataKey::Frontier(i);
            if bit == 0 {
                env.storage().instance().set(&fk, &cur);
                cur = poseidon2_hash2(&env, &cur, &zeroes[i as usize]);
            } else {
                let left: BytesN<32> = env
                    .storage()
                    .instance()
                    .get(&fk)
                    .unwrap_or_else(|| zeroes[i as usize].clone());
                cur = poseidon2_hash2(&env, &left, &cur);
            }
            i += 1;
        }

        env.storage().instance().set(&DataKey::Root, &cur);
        // Record this root so proofs built against it stay valid after later deposits.
        env.storage()
            .persistent()
            .set(&DataKey::KnownRoot(cur.clone()), &true);
        next_index = next_index.saturating_add(1);
        env.storage().instance().set(&DataKey::NextIndex, &next_index);

        DepositEvent {
            idx: &idx,
            commitment: &commitment,
        }
        .publish(&env);
        Ok(idx)
    }

    /// Post an anonymous, proof-backed message to a creator's wall.
    ///
    /// `public_inputs` is [root, nullifier_hash, creator, msg_hash] (4x32 bytes).
    /// No auth: trust comes entirely from the proof + nullifier.
    pub fn post(
        env: Env,
        public_inputs: Bytes,
        proof_bytes: Bytes,
        message: Bytes,
    ) -> Result<(), Error> {
        if message.len() > MAX_MESSAGE_LEN {
            return Err(Error::MessageTooLong);
        }
        let [root_arr, nf_arr, creator_arr, msg_hash_arr] = parse_public_inputs(&public_inputs)?;

        // Single-use nullifier.
        let nf = BytesN::from_array(&env, &nf_arr);
        let nf_key = DataKey::Nullifier(nf.clone());
        if env.storage().persistent().has(&nf_key) {
            return Err(Error::NullifierUsed);
        }

        // Proof must bind to a root the tree actually produced.
        let root = BytesN::from_array(&env, &root_arr);
        if !env.storage().persistent().has(&DataKey::KnownRoot(root)) {
            return Err(Error::UnknownRoot);
        }

        // Bind the message: msg_hash in the proof must equal hash(message).
        let expected = message_hash_field(&env, &message);
        if expected != msg_hash_arr {
            return Err(Error::MessageHashMismatch);
        }

        // Verify the UltraHonk proof on the external verifier contract.
        let verifier: Address = env
            .storage()
            .instance()
            .get(&DataKey::Verifier)
            .ok_or(Error::NotInitialized)?;
        let mut args: Vec<Val> = Vec::new(&env);
        args.push_back(public_inputs.into_val(&env));
        args.push_back(proof_bytes.into_val(&env));
        env.try_invoke_contract::<(), InvokeError>(
            &verifier,
            &Symbol::new(&env, "verify_proof"),
            args,
        )
        .map_err(|_| Error::VerificationFailed)?
        .map_err(|_| Error::VerificationFailed)?;

        // Append the message to the creator's wall.
        let creator = BytesN::from_array(&env, &creator_arr);
        let wall_key = DataKey::Wall(creator);
        let mut wall: Vec<AnonMessage> = env
            .storage()
            .persistent()
            .get(&wall_key)
            .unwrap_or_else(|| Vec::new(&env));
        wall.push_back(AnonMessage {
            message,
            timestamp: env.ledger().timestamp(),
        });
        env.storage().persistent().set(&wall_key, &wall);

        // Mark nullifier spent and announce.
        env.storage().persistent().set(&nf_key, &true);
        PostEvent { nullifier_hash: &nf }.publish(&env);
        Ok(())
    }

    pub fn get_wall(env: Env, creator: BytesN<32>) -> Vec<AnonMessage> {
        env.storage()
            .persistent()
            .get(&DataKey::Wall(creator))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_root(env: Env) -> Option<BytesN<32>> {
        env.storage().instance().get(&DataKey::Root)
    }

    /// All leaf commitments in insertion order. Used to rebuild Merkle paths.
    pub fn get_leaves(env: Env) -> Vec<BytesN<32>> {
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextIndex)
            .unwrap_or(0u32);
        let mut out = Vec::new(&env);
        let mut i = 0u32;
        while i < count {
            if let Some(leaf) = env.storage().persistent().get(&DataKey::Leaf(i)) {
                out.push_back(leaf);
            }
            i += 1;
        }
        out
    }

    pub fn is_nullifier_used(env: Env, nullifier_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier_hash))
    }
}
