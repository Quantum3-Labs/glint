#![no_std]

//! # Glint Private Patronage Pool
//!
//! A Tornado-style privacy pool that custodies real USDC and lets a supporter
//! take several anonymous actions off a single fixed-amount deposit.
//!
//! ## Flow
//!
//! 1. `deposit(from, tier, commitment)` — the supporter signs a USDC transfer of
//!    `tier` stroops into this contract and appends `commitment =
//!    Poseidon(nullifier, secret, creator, tier)` to that tier's Merkle tree. The
//!    commitment is computed client-side, so the pool never learns the secret.
//!
//! 2. From that one deposit, anyone (a relayer) can later submit a zero-knowledge
//!    proof of membership for three independent, single-use actions. The proof's
//!    `domain` selects the action and separates the nullifiers:
//!    - `withdraw(...)` — privately pay the creator `tier` USDC from the pool.
//!    - `post(...)`     — record an anonymous message on the creator's wall.
//!    - `vote(...)`     — cast one anonymous vote in a creator poll.
//!    The submitting account is unlinkable to the original deposit.
//!
//! ## Tiers
//!
//! Each fixed denomination has its own Merkle tree, keyed by the stroop amount.
//! `tier` is bound into the commitment and exposed as a public input, so a proof
//! for a $1 deposit cannot withdraw a $10 payout.
//!
//! ## Payout binding
//!
//! `creator` is `keccak256(slug) mod r`, not a wallet, so the contract cannot
//! derive the payout address from the proof. The admin registers
//! `creator -> wallet` via `register_payout`; `withdraw` pays that wallet. A
//! relayer therefore cannot redirect a withdrawal.

extern crate alloc;
use alloc::vec::Vec as RustVec;

use soroban_poseidon::{poseidon2_hash, Field};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, crypto::BnScalar,
    token::TokenClient, Address, Bytes, BytesN, Env, IntoVal, InvokeError, Symbol, Val, Vec, U256,
};

/// Merkle tree depth. MUST match the Noir circuit's `TREE_DEPTH`.
const TREE_DEPTH: u32 = 20;
const MAX_LEAVES: u32 = 1u32 << TREE_DEPTH;

/// UltraHonk public inputs: 7 field elements
/// [root, nullifier_hash, creator, tier, domain, sub_id, action_data].
const PUBLIC_INPUTS_LEN: u32 = 7 * 32;

/// Max anonymous message length (bytes). Matches the Glint server limit.
const MAX_MESSAGE_LEN: u32 = 280;

/// Action domains (must match the circuit's nullifier domain separation).
const DOMAIN_WITHDRAW: u64 = 1;
const DOMAIN_MESSAGE: u64 = 2;
const DOMAIN_VOTE: u64 = 3;

/// Allowed deposit tiers in USDC stroops (7 decimals): $0.1, $1, $5, $10, $100.
const TIER_01: i128 = 1_000_000;
const TIER_1: i128 = 10_000_000;
const TIER_5: i128 = 50_000_000;
const TIER_10: i128 = 100_000_000;
const TIER_100: i128 = 1_000_000_000;

fn is_valid_tier(amount: i128) -> bool {
    amount == TIER_01
        || amount == TIER_1
        || amount == TIER_5
        || amount == TIER_10
        || amount == TIER_100
}

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
    InvalidTier = 11,
    WrongDomain = 12,
    RecipientMismatch = 13,
    PollNotFound = 14,
    InvalidChoice = 15,
    PollExists = 16,
}

#[contracttype]
#[derive(Clone)]
pub struct AnonMessage {
    /// Free-form anonymous note as raw UTF-8 bytes (the frontend decodes it).
    pub message: Bytes,
    /// Deposit tier (stroops) behind this message — the "verified $X" badge.
    pub tier: i128,
    /// Ledger timestamp when the message was posted.
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Verifier,
    /// USDC SAC address the pool custodies.
    Token,
    // ---- per-tier Merkle tree (keyed by stroop amount) ----
    Root(i128),
    NextIndex(i128),
    Frontier(i128, u32),
    Leaf(i128, u32),
    KnownRoot(i128, BytesN<32>),
    // ---- global uniqueness ----
    Commitment(BytesN<32>),
    Nullifier(BytesN<32>),
    // ---- per-creator state ----
    Wall(BytesN<32>),
    /// (creator, poll_id) -> number of options.
    Poll(BytesN<32>, u32),
    /// (creator, poll_id, choice) -> stake-weighted vote total (sum of tiers).
    Tally(BytesN<32>, u32, u32),
}

#[contractevent(topics = ["deposit"], data_format = "map")]
pub struct DepositEvent<'a> {
    #[topic]
    pub tier: &'a i128,
    #[topic]
    pub idx: &'a u32,
    pub commitment: &'a BytesN<32>,
}

#[contractevent(topics = ["withdraw"], data_format = "single-value")]
pub struct WithdrawEvent<'a> {
    pub nullifier_hash: &'a BytesN<32>,
}

#[contractevent(topics = ["post"], data_format = "single-value")]
pub struct PostEvent<'a> {
    pub nullifier_hash: &'a BytesN<32>,
}

#[contractevent(topics = ["vote"], data_format = "map")]
pub struct VoteEvent<'a> {
    #[topic]
    pub poll_id: &'a u32,
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

fn parse_public_inputs(bytes: &Bytes) -> Result<[[u8; 32]; 7], Error> {
    if bytes.len() != PUBLIC_INPUTS_LEN {
        return Err(Error::InvalidPublicInputs);
    }
    let mut buf = [0u8; PUBLIC_INPUTS_LEN as usize];
    bytes.copy_into_slice(&mut buf);
    let mut out = [[0u8; 32]; 7];
    for i in 0..7 {
        out[i].copy_from_slice(&buf[i * 32..(i + 1) * 32]);
    }
    Ok(out)
}

/// Interpret a field element as a small unsigned integer (domain, sub_id,
/// choice). The upper 24 bytes must be zero.
fn field_to_u64(arr: &[u8; 32]) -> Result<u64, Error> {
    for i in 0..24 {
        if arr[i] != 0 {
            return Err(Error::InvalidPublicInputs);
        }
    }
    let mut v: u64 = 0;
    for i in 24..32 {
        v = (v << 8) | (arr[i] as u64);
    }
    Ok(v)
}

/// Interpret a field element as an i128 token amount. The upper 16 bytes must be
/// zero (tiers are tiny, so this never overflows the sign bit).
fn field_to_amount(arr: &[u8; 32]) -> Result<i128, Error> {
    for i in 0..16 {
        if arr[i] != 0 {
            return Err(Error::InvalidTier);
        }
    }
    let mut v: i128 = 0;
    for i in 16..32 {
        v = (v << 8) | (arr[i] as i128);
    }
    Ok(v)
}

/// keccak256(message) reduced mod the BN254 scalar field, big-endian. The client
/// MUST compute msg_hash the same way so the on-chain message binding passes.
fn message_hash_field(env: &Env, message: &Bytes) -> [u8; 32] {
    let digest = env.crypto().keccak256(message);
    let modulus = <BnScalar as Field>::modulus(env);
    let reduced = U256::from_be_bytes(env, &Bytes::from_array(env, &digest.to_array()))
        .rem_euclid(&modulus);
    let mut arr = [0u8; 32];
    reduced.to_be_bytes().copy_into_slice(&mut arr);
    arr
}

/// keccak256(recipient strkey ASCII) reduced mod r. Matches the client's
/// `keccakField(utf8(address))`, so the withdraw recipient binding passes.
fn address_field(env: &Env, addr: &Address) -> [u8; 32] {
    let s = addr.to_string();
    let len = s.len() as usize;
    // Strkeys are 56 chars (G.../C...), 69 for muxed (M...). Buffer covers all.
    let mut buf = [0u8; 69];
    s.copy_into_slice(&mut buf[..len]);
    let bytes = Bytes::from_slice(env, &buf[..len]);
    let digest = env.crypto().keccak256(&bytes);
    let modulus = <BnScalar as Field>::modulus(env);
    let reduced = U256::from_be_bytes(env, &Bytes::from_array(env, &digest.to_array()))
        .rem_euclid(&modulus);
    let mut arr = [0u8; 32];
    reduced.to_be_bytes().copy_into_slice(&mut arr);
    arr
}

#[contractimpl]
impl Patronage {
    pub fn __constructor(
        env: Env,
        admin: Address,
        verifier: Address,
        token: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::Token, &token);
        Ok(())
    }

    /// Open a poll for a creator. Admin-only (the server opens it on the
    /// creator's behalf). `options` is the number of choices (0..options-1).
    pub fn create_poll(
        env: Env,
        creator: BytesN<32>,
        poll_id: u32,
        options: u32,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;
        let key = DataKey::Poll(creator, poll_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::PollExists);
        }
        env.storage().persistent().set(&key, &options);
        Ok(())
    }

    /// Deposit `tier` USDC into the pool and append `commitment` to that tier's
    /// tree. The supporter signs the token transfer (`from.require_auth`).
    pub fn deposit(
        env: Env,
        from: Address,
        tier: i128,
        commitment: BytesN<32>,
    ) -> Result<u32, Error> {
        if !is_valid_tier(tier) {
            return Err(Error::InvalidTier);
        }
        from.require_auth();

        let cm_key = DataKey::Commitment(commitment.clone());
        if env.storage().persistent().has(&cm_key) {
            return Err(Error::CommitmentExists);
        }

        // Pull the fixed amount into the pool.
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        TokenClient::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &tier,
        );

        let idx = Self::append_leaf(&env, tier, &commitment)?;
        env.storage().persistent().set(&cm_key, &true);

        DepositEvent {
            tier: &tier,
            idx: &idx,
            commitment: &commitment,
        }
        .publish(&env);
        Ok(idx)
    }

    /// Privately pay `recipient` `tier` USDC from the pool.
    ///
    /// `public_inputs` is [root, nullifier_hash, creator, tier, domain, sub_id,
    /// action_data]. Requires `domain == WITHDRAW`. No auth: trust comes from the
    /// proof + single-use nullifier. `recipient` is bound into the proof via
    /// `action_data == keccak(recipient_strkey) mod r`, so a relayer cannot
    /// redirect funds — the depositor chose the recipient when proving.
    pub fn withdraw(
        env: Env,
        public_inputs: Bytes,
        proof_bytes: Bytes,
        recipient: Address,
    ) -> Result<(), Error> {
        let pi = parse_public_inputs(&public_inputs)?;
        let domain = field_to_u64(&pi[4])?;
        if domain != DOMAIN_WITHDRAW {
            return Err(Error::WrongDomain);
        }

        let tier = field_to_amount(&pi[3])?;
        if !is_valid_tier(tier) {
            return Err(Error::InvalidTier);
        }

        // Bind the recipient: action_data must equal keccak(recipient) mod r.
        let expected = address_field(&env, &recipient);
        if expected != pi[6] {
            return Err(Error::RecipientMismatch);
        }

        let nf = Self::consume_nullifier_check(&env, &pi[1])?;
        Self::check_known_root(&env, tier, &pi[0])?;
        Self::verify_proof(&env, &public_inputs, &proof_bytes)?;

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &recipient,
            &tier,
        );

        env.storage().persistent().set(&DataKey::Nullifier(nf.clone()), &true);
        WithdrawEvent { nullifier_hash: &nf }.publish(&env);
        Ok(())
    }

    /// Post an anonymous, proof-backed message to a creator's wall.
    /// Requires `domain == MESSAGE` and `action_data == keccak(message)`.
    pub fn post(
        env: Env,
        public_inputs: Bytes,
        proof_bytes: Bytes,
        message: Bytes,
    ) -> Result<(), Error> {
        if message.len() > MAX_MESSAGE_LEN {
            return Err(Error::MessageTooLong);
        }
        let pi = parse_public_inputs(&public_inputs)?;
        let domain = field_to_u64(&pi[4])?;
        if domain != DOMAIN_MESSAGE {
            return Err(Error::WrongDomain);
        }

        // Bind the message: action_data must equal keccak(message) mod r.
        let expected = message_hash_field(&env, &message);
        if expected != pi[6] {
            return Err(Error::MessageHashMismatch);
        }

        let tier = field_to_amount(&pi[3])?;
        if !is_valid_tier(tier) {
            return Err(Error::InvalidTier);
        }

        let nf = Self::consume_nullifier_check(&env, &pi[1])?;
        Self::check_known_root(&env, tier, &pi[0])?;
        Self::verify_proof(&env, &public_inputs, &proof_bytes)?;

        let creator = BytesN::from_array(&env, &pi[2]);
        let wall_key = DataKey::Wall(creator);
        let mut wall: Vec<AnonMessage> = env
            .storage()
            .persistent()
            .get(&wall_key)
            .unwrap_or_else(|| Vec::new(&env));
        wall.push_back(AnonMessage {
            message,
            tier,
            timestamp: env.ledger().timestamp(),
        });
        env.storage().persistent().set(&wall_key, &wall);

        env.storage().persistent().set(&DataKey::Nullifier(nf.clone()), &true);
        PostEvent { nullifier_hash: &nf }.publish(&env);
        Ok(())
    }

    /// Cast one anonymous vote in a creator poll. Requires `domain == VOTE`,
    /// `sub_id == poll_id`, and `action_data == choice`. The nullifier embeds
    /// `poll_id`, so one deposit votes at most once per poll.
    pub fn vote(
        env: Env,
        public_inputs: Bytes,
        proof_bytes: Bytes,
        choice: u32,
    ) -> Result<(), Error> {
        let pi = parse_public_inputs(&public_inputs)?;
        let domain = field_to_u64(&pi[4])?;
        if domain != DOMAIN_VOTE {
            return Err(Error::WrongDomain);
        }

        let poll_id = field_to_u64(&pi[5])? as u32;
        let action_choice = field_to_u64(&pi[6])? as u32;
        if action_choice != choice {
            return Err(Error::InvalidChoice);
        }

        let creator = BytesN::from_array(&env, &pi[2]);
        let options: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::Poll(creator.clone(), poll_id))
            .ok_or(Error::PollNotFound)?;
        if choice >= options {
            return Err(Error::InvalidChoice);
        }

        let tier = field_to_amount(&pi[3])?;
        if !is_valid_tier(tier) {
            return Err(Error::InvalidTier);
        }

        let nf = Self::consume_nullifier_check(&env, &pi[1])?;
        Self::check_known_root(&env, tier, &pi[0])?;
        Self::verify_proof(&env, &public_inputs, &proof_bytes)?;

        // Stake-weighted: a vote adds its deposit tier, so influence is
        // proportional to money staked and immune to splitting into cheap
        // deposits (1x$100 == 100x$1 in weight).
        let tally_key = DataKey::Tally(creator, poll_id, choice);
        let weight: i128 = env.storage().persistent().get(&tally_key).unwrap_or(0i128);
        env.storage()
            .persistent()
            .set(&tally_key, &(weight.saturating_add(tier)));

        env.storage().persistent().set(&DataKey::Nullifier(nf.clone()), &true);
        VoteEvent {
            poll_id: &poll_id,
            nullifier_hash: &nf,
        }
        .publish(&env);
        Ok(())
    }

    // ---- views ----

    pub fn get_wall(env: Env, creator: BytesN<32>) -> Vec<AnonMessage> {
        env.storage()
            .persistent()
            .get(&DataKey::Wall(creator))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_root(env: Env, tier: i128) -> Option<BytesN<32>> {
        env.storage().instance().get(&DataKey::Root(tier))
    }

    /// All leaf commitments for a tier in insertion order (rebuilds Merkle paths).
    pub fn get_leaves(env: Env, tier: i128) -> Vec<BytesN<32>> {
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextIndex(tier))
            .unwrap_or(0u32);
        let mut out = Vec::new(&env);
        let mut i = 0u32;
        while i < count {
            if let Some(leaf) = env.storage().persistent().get(&DataKey::Leaf(tier, i)) {
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

    /// Stake-weighted vote totals for a poll (sum of deposit tiers, in stroops),
    /// indexed by choice (0..options-1).
    pub fn get_tally(env: Env, creator: BytesN<32>, poll_id: u32) -> Vec<i128> {
        let options: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::Poll(creator.clone(), poll_id))
            .unwrap_or(0u32);
        let mut out = Vec::new(&env);
        let mut c = 0u32;
        while c < options {
            let weight: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::Tally(creator.clone(), poll_id, c))
                .unwrap_or(0i128);
            out.push_back(weight);
            c += 1;
        }
        out
    }

    // ---- internal helpers ----

    fn require_admin(env: &Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        Ok(())
    }

    /// Error if the nullifier is already spent; returns it for later marking.
    fn consume_nullifier_check(env: &Env, nf_arr: &[u8; 32]) -> Result<BytesN<32>, Error> {
        let nf = BytesN::from_array(env, nf_arr);
        if env.storage().persistent().has(&DataKey::Nullifier(nf.clone())) {
            return Err(Error::NullifierUsed);
        }
        Ok(nf)
    }

    fn check_known_root(env: &Env, tier: i128, root_arr: &[u8; 32]) -> Result<(), Error> {
        let root = BytesN::from_array(env, root_arr);
        if !env
            .storage()
            .persistent()
            .has(&DataKey::KnownRoot(tier, root))
        {
            return Err(Error::UnknownRoot);
        }
        Ok(())
    }

    fn verify_proof(env: &Env, public_inputs: &Bytes, proof_bytes: &Bytes) -> Result<(), Error> {
        let verifier: Address = env
            .storage()
            .instance()
            .get(&DataKey::Verifier)
            .ok_or(Error::NotInitialized)?;
        let mut args: Vec<Val> = Vec::new(env);
        args.push_back(public_inputs.into_val(env));
        args.push_back(proof_bytes.into_val(env));
        env.try_invoke_contract::<(), InvokeError>(
            &verifier,
            &Symbol::new(env, "verify_proof"),
            args,
        )
        .map_err(|_| Error::VerificationFailed)?
        .map_err(|_| Error::VerificationFailed)?;
        Ok(())
    }

    /// Frontier-incremental insert into the tier tree. Returns the leaf index.
    fn append_leaf(env: &Env, tier: i128, commitment: &BytesN<32>) -> Result<u32, Error> {
        let mut next_index: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextIndex(tier))
            .unwrap_or(0u32);
        if next_index >= MAX_LEAVES {
            return Err(Error::TreeFull);
        }
        let idx = next_index;
        env.storage()
            .persistent()
            .set(&DataKey::Leaf(tier, idx), commitment);

        let zeroes = zeroes_for_tree(env);
        let mut cur = commitment.clone();
        let mut i = 0u32;
        while i < TREE_DEPTH {
            let bit = (idx >> i) & 1;
            let fk = DataKey::Frontier(tier, i);
            if bit == 0 {
                env.storage().instance().set(&fk, &cur);
                cur = poseidon2_hash2(env, &cur, &zeroes[i as usize]);
            } else {
                let left: BytesN<32> = env
                    .storage()
                    .instance()
                    .get(&fk)
                    .unwrap_or_else(|| zeroes[i as usize].clone());
                cur = poseidon2_hash2(env, &left, &cur);
            }
            i += 1;
        }

        env.storage().instance().set(&DataKey::Root(tier), &cur);
        env.storage()
            .persistent()
            .set(&DataKey::KnownRoot(tier, cur), &true);
        next_index = next_index.saturating_add(1);
        env.storage()
            .instance()
            .set(&DataKey::NextIndex(tier), &next_index);
        Ok(idx)
    }
}
