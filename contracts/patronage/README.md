# Glint Patronage Pool (Soroban)

A Tornado-style privacy pool for **anonymous creator patronage**. Pairs with the
Noir circuit in [`circuits/patronage`](../../circuits/patronage) and an external
UltraHonk verifier contract.

## Why this exists

Glint tips are public (USDC over x402, recorded on the TipJar wall). This pool
lets a supporter later prove "I backed creator C" and post a **verified anonymous**
message — without revealing which wallet or which payment was theirs.

## Design decisions

- **Global pool.** Every tip (any creator) commits into one Merkle tree, so the
  anonymity set is every depositor — not just this creator's supporters. The
  `creator` is a public input: we reveal *which* creator is backed, hide *who*.
- **Commitment = `Poseidon(nullifier, secret, creator)`.** Built client-side, so
  the server never learns the secret.
- **Server-gated deposit.** `deposit` requires admin auth: the Glint server
  appends the commitment right after the x402 payment settles.
- **Open post.** `post` needs no auth — trust comes from the ZK proof + the
  single-use nullifier. A relayer (the server) submits it so the transaction's
  source account does not link back to the supporter.
- **Message binding.** `msg_hash` is a public input of the proof; `post`
  recomputes `keccak256(message) mod r` and rejects a mismatch, so a relayer
  cannot swap the message.
- **Root history.** Each new deposit changes the root, so `KnownRoot` records
  every root produced; a proof built against any past root still verifies.

## Verified feasible (Day-1 spike)

The full deposit -> withdraw of the upstream `tornado_classic` reference runs
on Stellar testnet at **83.77M / 100M** instructions. See
[`docs/zk-hackathon-feasibility.md`](../../docs/zk-hackathon-feasibility.md).

## Interface

| fn | auth | purpose |
|---|---|---|
| `__constructor(admin, verifier)` | — | set the server admin + verifier contract |
| `deposit(commitment) -> u32` | admin | append a commitment, return its leaf index |
| `post(public_inputs, proof, message)` | none | verify proof, record anonymous message |
| `get_wall(creator) -> Vec<AnonMessage>` | none | read a creator's anonymous wall |
| `get_root() -> Option<BytesN<32>>` | none | current Merkle root |
| `get_leaves() -> Vec<BytesN<32>>` | none | all leaf commitments (client rebuilds the path) |
| `is_nullifier_used(nf) -> bool` | none | nullifier spent check |

`public_inputs` = `[root, nullifier_hash, creator, msg_hash]` (4 x 32 bytes).

## Scaffold TODO (not production-ready)

- [ ] **Amount tiers.** To support "tipped >= $X", run one tree per amount tier
      and deposit into the tier matching the settled payment. This contract is a
      single tier. (Hidden amounts inside the commitment are unsafe — the server
      cannot verify a hidden amount, so a client could lie.)
- [ ] **Bounded root history** — evict old `KnownRoot` entries (ring buffer).
- [ ] Confirm `keccak256(message) mod r` matches the client byte-for-byte, and
      that the circuit's `msg_hash` binding survives Noir optimization.
- [ ] Tests (deposit/post happy path + double-spend + wrong-root + bad-message).
- [ ] Re-measure `post` instructions against the ~16M headroom once wired.

## Build

```bash
stellar contract build   # -> target/wasm32v1-none/release/patronage.wasm
```
