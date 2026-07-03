#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, token};

// ---- mock verifiers ----
//
// Real UltraHonk proofs cannot be generated inside a Rust unit test, so we stub
// the verifier cross-call. `AcceptVerifier` isolates the pool's own logic
// (nullifiers, roots, domains, bindings, tallies); `RejectVerifier` drives the
// `VerificationFailed` path.

#[contract]
pub struct AcceptVerifier;

#[contractimpl]
impl AcceptVerifier {
    pub fn verify_proof(_env: Env, _public_inputs: Bytes, _proof: Bytes) {}
}

#[contract]
pub struct RejectVerifier;

#[contractimpl]
impl RejectVerifier {
    pub fn verify_proof(_env: Env, _public_inputs: Bytes, _proof: Bytes) {
        panic!("proof rejected");
    }
}

// ---- helpers ----

struct Ctx {
    env: Env,
    client: PatronageClient<'static>,
    token: Address,
    depositor: Address,
}

/// Register the pool with a token SAC and a mock verifier (accepting or not),
/// then fund a depositor with `funding` stroops of the pooled token.
fn setup(accept: bool, funding: i128) -> Ctx {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let verifier = if accept {
        env.register(AcceptVerifier, ())
    } else {
        env.register(RejectVerifier, ())
    };

    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin);
    let token = sac.address();

    let contract_id = env.register(Patronage, (admin, verifier, token.clone()));
    let client = PatronageClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    token::StellarAssetClient::new(&env, &token).mint(&depositor, &funding);

    Ctx {
        env,
        client,
        token,
        depositor,
    }
}

fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
    token::TokenClient::new(env, token).balance(who)
}

fn commit(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

fn proof(env: &Env) -> Bytes {
    Bytes::new(env)
}

/// A field element carrying a small unsigned integer in its low 8 bytes,
/// matching the contract's `field_to_u64` layout (domain, sub_id, choice).
fn u64_field(v: u64) -> [u8; 32] {
    let mut a = [0u8; 32];
    a[24..32].copy_from_slice(&v.to_be_bytes());
    a
}

/// A field element carrying an i128 amount in its low 16 bytes, matching the
/// contract's `field_to_amount` layout (tier).
fn amount_field(v: i128) -> [u8; 32] {
    let mut a = [0u8; 32];
    a[16..32].copy_from_slice(&v.to_be_bytes());
    a
}

/// Assemble the 7 x 32-byte public-input blob the pool parses:
/// [root, nullifier_hash, creator, tier, domain, sub_id, action_data].
#[allow(clippy::too_many_arguments)]
fn public_inputs(
    env: &Env,
    root: &BytesN<32>,
    nullifier: &[u8; 32],
    creator: &[u8; 32],
    tier: i128,
    domain: u64,
    sub_id: u64,
    action_data: &[u8; 32],
) -> Bytes {
    let mut buf = [0u8; PUBLIC_INPUTS_LEN as usize];
    buf[0..32].copy_from_slice(&root.to_array());
    buf[32..64].copy_from_slice(nullifier);
    buf[64..96].copy_from_slice(creator);
    buf[96..128].copy_from_slice(&amount_field(tier));
    buf[128..160].copy_from_slice(&u64_field(domain));
    buf[160..192].copy_from_slice(&u64_field(sub_id));
    buf[192..224].copy_from_slice(action_data);
    Bytes::from_slice(env, &buf)
}

const CREATOR: [u8; 32] = [7u8; 32];

// ---- deposit ----

#[test]
fn deposit_happy_path() {
    let ctx = setup(true, TIER_1);
    let idx = ctx
        .client
        .deposit(&ctx.depositor, &TIER_1, &commit(&ctx.env, 1));
    assert_eq!(idx, 0);
    assert_eq!(ctx.client.get_leaves(&TIER_1).len(), 1);
    assert!(ctx.client.get_root(&TIER_1).is_some());
    // USDC moved from the depositor into the pool.
    assert_eq!(balance(&ctx.env, &ctx.token, &ctx.depositor), 0);
    assert_eq!(
        balance(&ctx.env, &ctx.token, &ctx.client.address),
        TIER_1
    );
}

#[test]
fn deposit_invalid_tier() {
    let ctx = setup(true, TIER_1);
    let res = ctx
        .client
        .try_deposit(&ctx.depositor, &12_345, &commit(&ctx.env, 1));
    assert_eq!(res, Err(Ok(Error::InvalidTier)));
}

#[test]
fn deposit_duplicate_commitment() {
    let ctx = setup(true, TIER_1 * 2);
    let cm = commit(&ctx.env, 1);
    ctx.client.deposit(&ctx.depositor, &TIER_1, &cm);
    let res = ctx.client.try_deposit(&ctx.depositor, &TIER_1, &cm);
    assert_eq!(res, Err(Ok(Error::CommitmentExists)));
}

// ---- withdraw ----

/// Deposit one TIER_1 note and return the resulting root.
fn deposit_one(ctx: &Ctx, seed: u8) -> BytesN<32> {
    ctx.client
        .deposit(&ctx.depositor, &TIER_1, &commit(&ctx.env, seed));
    ctx.client.get_root(&TIER_1).unwrap()
}

#[test]
fn withdraw_happy_path() {
    let ctx = setup(true, TIER_1);
    let root = deposit_one(&ctx, 1);
    let recipient = Address::generate(&ctx.env);
    let action = address_field(&ctx.env, &recipient);
    let pi = public_inputs(
        &ctx.env,
        &root,
        &[1u8; 32],
        &CREATOR,
        TIER_1,
        DOMAIN_WITHDRAW,
        0,
        &action,
    );
    ctx.client.withdraw(&pi, &proof(&ctx.env), &recipient);
    assert_eq!(balance(&ctx.env, &ctx.token, &recipient), TIER_1);
    assert!(ctx.client.is_nullifier_used(&BytesN::from_array(&ctx.env, &[1u8; 32])));
}

#[test]
fn withdraw_double_spend() {
    let ctx = setup(true, TIER_1);
    let root = deposit_one(&ctx, 1);
    let recipient = Address::generate(&ctx.env);
    let action = address_field(&ctx.env, &recipient);
    let pi = public_inputs(
        &ctx.env, &root, &[1u8; 32], &CREATOR, TIER_1, DOMAIN_WITHDRAW, 0, &action,
    );
    ctx.client.withdraw(&pi, &proof(&ctx.env), &recipient);
    // Same nullifier again -> rejected.
    let res = ctx.client.try_withdraw(&pi, &proof(&ctx.env), &recipient);
    assert_eq!(res, Err(Ok(Error::NullifierUsed)));
}

#[test]
fn withdraw_unknown_root() {
    let ctx = setup(true, TIER_1);
    deposit_one(&ctx, 1);
    let recipient = Address::generate(&ctx.env);
    let action = address_field(&ctx.env, &recipient);
    let bogus_root = commit(&ctx.env, 0xAB);
    let pi = public_inputs(
        &ctx.env, &bogus_root, &[1u8; 32], &CREATOR, TIER_1, DOMAIN_WITHDRAW, 0, &action,
    );
    let res = ctx.client.try_withdraw(&pi, &proof(&ctx.env), &recipient);
    assert_eq!(res, Err(Ok(Error::UnknownRoot)));
}

#[test]
fn withdraw_wrong_domain() {
    let ctx = setup(true, TIER_1);
    let root = deposit_one(&ctx, 1);
    let recipient = Address::generate(&ctx.env);
    let action = address_field(&ctx.env, &recipient);
    // domain MESSAGE on a withdraw call.
    let pi = public_inputs(
        &ctx.env, &root, &[1u8; 32], &CREATOR, TIER_1, DOMAIN_MESSAGE, 0, &action,
    );
    let res = ctx.client.try_withdraw(&pi, &proof(&ctx.env), &recipient);
    assert_eq!(res, Err(Ok(Error::WrongDomain)));
}

#[test]
fn withdraw_recipient_mismatch() {
    let ctx = setup(true, TIER_1);
    let root = deposit_one(&ctx, 1);
    let recipient = Address::generate(&ctx.env);
    let other = Address::generate(&ctx.env);
    // action_data binds `other`, but we pay `recipient`.
    let action = address_field(&ctx.env, &other);
    let pi = public_inputs(
        &ctx.env, &root, &[1u8; 32], &CREATOR, TIER_1, DOMAIN_WITHDRAW, 0, &action,
    );
    let res = ctx.client.try_withdraw(&pi, &proof(&ctx.env), &recipient);
    assert_eq!(res, Err(Ok(Error::RecipientMismatch)));
}

#[test]
fn withdraw_cross_tier_replay() {
    // Deposit into TIER_1, then present its root while claiming TIER_10. The
    // root is not a known root for the TIER_10 tree, so it is rejected.
    let ctx = setup(true, TIER_1);
    let root = deposit_one(&ctx, 1);
    let recipient = Address::generate(&ctx.env);
    let action = address_field(&ctx.env, &recipient);
    let pi = public_inputs(
        &ctx.env, &root, &[1u8; 32], &CREATOR, TIER_10, DOMAIN_WITHDRAW, 0, &action,
    );
    let res = ctx.client.try_withdraw(&pi, &proof(&ctx.env), &recipient);
    assert_eq!(res, Err(Ok(Error::UnknownRoot)));
}

#[test]
fn withdraw_verification_failed() {
    let ctx = setup(false, TIER_1); // rejecting verifier
    let root = deposit_one(&ctx, 1);
    let recipient = Address::generate(&ctx.env);
    let action = address_field(&ctx.env, &recipient);
    let pi = public_inputs(
        &ctx.env, &root, &[1u8; 32], &CREATOR, TIER_1, DOMAIN_WITHDRAW, 0, &action,
    );
    let res = ctx.client.try_withdraw(&pi, &proof(&ctx.env), &recipient);
    assert_eq!(res, Err(Ok(Error::VerificationFailed)));
}

// ---- post ----

#[test]
fn post_happy_path() {
    let ctx = setup(true, TIER_5);
    ctx.client
        .deposit(&ctx.depositor, &TIER_5, &commit(&ctx.env, 1));
    let root = ctx.client.get_root(&TIER_5).unwrap();
    let message = Bytes::from_slice(&ctx.env, b"gm creator");
    let action = message_hash_field(&ctx.env, &message);
    let pi = public_inputs(
        &ctx.env, &root, &[2u8; 32], &CREATOR, TIER_5, DOMAIN_MESSAGE, 0, &action,
    );
    ctx.client.post(&pi, &proof(&ctx.env), &message);

    let wall = ctx.client.get_wall(&BytesN::from_array(&ctx.env, &CREATOR));
    assert_eq!(wall.len(), 1);
    let m = wall.get(0).unwrap();
    assert_eq!(m.message, message);
    assert_eq!(m.tier, TIER_5);
}

#[test]
fn post_message_hash_mismatch() {
    let ctx = setup(true, TIER_1);
    let root = deposit_one(&ctx, 1);
    let message = Bytes::from_slice(&ctx.env, b"real message");
    let other = Bytes::from_slice(&ctx.env, b"other message");
    let action = message_hash_field(&ctx.env, &other); // binds the wrong message
    let pi = public_inputs(
        &ctx.env, &root, &[2u8; 32], &CREATOR, TIER_1, DOMAIN_MESSAGE, 0, &action,
    );
    let res = ctx.client.try_post(&pi, &proof(&ctx.env), &message);
    assert_eq!(res, Err(Ok(Error::MessageHashMismatch)));
}

#[test]
fn post_message_too_long() {
    let ctx = setup(true, TIER_1);
    let root = deposit_one(&ctx, 1);
    let long = Bytes::from_slice(&ctx.env, &[b'x'; (MAX_MESSAGE_LEN + 1) as usize]);
    let action = message_hash_field(&ctx.env, &long);
    let pi = public_inputs(
        &ctx.env, &root, &[2u8; 32], &CREATOR, TIER_1, DOMAIN_MESSAGE, 0, &action,
    );
    let res = ctx.client.try_post(&pi, &proof(&ctx.env), &long);
    assert_eq!(res, Err(Ok(Error::MessageTooLong)));
}

// ---- vote ----

const POLL_ID: u32 = 1;

fn creator_bytes(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &CREATOR)
}

#[test]
fn vote_happy_path() {
    let ctx = setup(true, TIER_10);
    ctx.client.create_poll(&creator_bytes(&ctx.env), &POLL_ID, &3);
    ctx.client
        .deposit(&ctx.depositor, &TIER_10, &commit(&ctx.env, 1));
    let root = ctx.client.get_root(&TIER_10).unwrap();
    let choice = 2u32;
    let action = u64_field(choice as u64);
    let pi = public_inputs(
        &ctx.env,
        &root,
        &[3u8; 32],
        &CREATOR,
        TIER_10,
        DOMAIN_VOTE,
        POLL_ID as u64,
        &action,
    );
    ctx.client.vote(&pi, &proof(&ctx.env), &choice);

    let tally = ctx.client.get_tally(&creator_bytes(&ctx.env), &POLL_ID);
    assert_eq!(tally.get(0).unwrap(), 0);
    assert_eq!(tally.get(1).unwrap(), 0);
    // Stake-weighted: the choice gains the deposit tier, not +1.
    assert_eq!(tally.get(2).unwrap(), TIER_10);
}

#[test]
fn vote_poll_not_found() {
    let ctx = setup(true, TIER_1);
    let root = deposit_one(&ctx, 1);
    let choice = 0u32;
    let action = u64_field(choice as u64);
    let pi = public_inputs(
        &ctx.env, &root, &[3u8; 32], &CREATOR, TIER_1, DOMAIN_VOTE, POLL_ID as u64, &action,
    );
    let res = ctx.client.try_vote(&pi, &proof(&ctx.env), &choice);
    assert_eq!(res, Err(Ok(Error::PollNotFound)));
}

#[test]
fn vote_invalid_choice() {
    let ctx = setup(true, TIER_1);
    ctx.client.create_poll(&creator_bytes(&ctx.env), &POLL_ID, &2);
    let root = deposit_one(&ctx, 1);
    let choice = 5u32; // >= options
    let action = u64_field(choice as u64);
    let pi = public_inputs(
        &ctx.env, &root, &[3u8; 32], &CREATOR, TIER_1, DOMAIN_VOTE, POLL_ID as u64, &action,
    );
    let res = ctx.client.try_vote(&pi, &proof(&ctx.env), &choice);
    assert_eq!(res, Err(Ok(Error::InvalidChoice)));
}

#[test]
fn vote_wrong_domain() {
    let ctx = setup(true, TIER_1);
    ctx.client.create_poll(&creator_bytes(&ctx.env), &POLL_ID, &2);
    let root = deposit_one(&ctx, 1);
    let choice = 0u32;
    let action = u64_field(choice as u64);
    // domain WITHDRAW on a vote call.
    let pi = public_inputs(
        &ctx.env, &root, &[3u8; 32], &CREATOR, TIER_1, DOMAIN_WITHDRAW, POLL_ID as u64, &action,
    );
    let res = ctx.client.try_vote(&pi, &proof(&ctx.env), &choice);
    assert_eq!(res, Err(Ok(Error::WrongDomain)));
}

// ---- bounded root history (ring buffer) ----

#[test]
fn root_history_evicts_old_roots() {
    // Fund enough for ROOT_HISTORY_SIZE + 1 deposits plus a final withdraw.
    let ctx = setup(true, TIER_1 * (ROOT_HISTORY_SIZE as i128 + 2));

    // First deposit's root sits in ring slot 0.
    ctx.client
        .deposit(&ctx.depositor, &TIER_1, &commit(&ctx.env, 0));
    let root0 = ctx.client.get_root(&TIER_1).unwrap();

    // ROOT_HISTORY_SIZE more deposits. The last one (leaf index
    // ROOT_HISTORY_SIZE) wraps to slot 0 and evicts root0.
    for i in 1..=ROOT_HISTORY_SIZE {
        ctx.client
            .deposit(&ctx.depositor, &TIER_1, &commit(&ctx.env, i as u8));
    }

    let recipient = Address::generate(&ctx.env);
    let action = address_field(&ctx.env, &recipient);

    // A proof against the evicted root0 is now rejected.
    let pi_old = public_inputs(
        &ctx.env, &root0, &[100u8; 32], &CREATOR, TIER_1, DOMAIN_WITHDRAW, 0, &action,
    );
    let res = ctx.client.try_withdraw(&pi_old, &proof(&ctx.env), &recipient);
    assert_eq!(res, Err(Ok(Error::UnknownRoot)));

    // The current root still verifies.
    let root_now = ctx.client.get_root(&TIER_1).unwrap();
    let pi_new = public_inputs(
        &ctx.env, &root_now, &[101u8; 32], &CREATOR, TIER_1, DOMAIN_WITHDRAW, 0, &action,
    );
    ctx.client.withdraw(&pi_new, &proof(&ctx.env), &recipient);
    assert_eq!(balance(&ctx.env, &ctx.token, &recipient), TIER_1);
}

#[test]
fn root_history_keeps_recent_roots() {
    // A root from within the last ROOT_HISTORY_SIZE deposits still verifies.
    let ctx = setup(true, TIER_1 * (ROOT_HISTORY_SIZE as i128 + 1));

    ctx.client
        .deposit(&ctx.depositor, &TIER_1, &commit(&ctx.env, 0));
    let root0 = ctx.client.get_root(&TIER_1).unwrap();

    // Only ROOT_HISTORY_SIZE - 1 further deposits, so root0 is not yet evicted.
    for i in 1..ROOT_HISTORY_SIZE {
        ctx.client
            .deposit(&ctx.depositor, &TIER_1, &commit(&ctx.env, i as u8));
    }

    let recipient = Address::generate(&ctx.env);
    let action = address_field(&ctx.env, &recipient);
    let pi = public_inputs(
        &ctx.env, &root0, &[100u8; 32], &CREATOR, TIER_1, DOMAIN_WITHDRAW, 0, &action,
    );
    ctx.client.withdraw(&pi, &proof(&ctx.env), &recipient);
    assert_eq!(balance(&ctx.env, &ctx.token, &recipient), TIER_1);
}
