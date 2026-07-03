# Glint Private Patronage Pool (Soroban)

A Tornado-style privacy pool that **custodies USDC** and lets a supporter take
several anonymous actions off a single fixed-amount deposit. Pairs with the Noir
circuit in [`circuits/patronage`](../../circuits/patronage) and an external
UltraHonk verifier contract.

## Why this exists

One private deposit unlocks three single-use, unlinkable actions for a creator:
pay them privately (withdraw), post a verified anonymous message, and vote in a
poll — none of it linkable to the depositor's wallet.

## Design decisions

- **Tier pools.** Each fixed denomination ($0.1/$1/$5/$10/$100 in stroops) has its own
  Merkle tree. `tier` is bound into the commitment and exposed as a public input,
  so a $1 deposit cannot withdraw a $10 payout.
- **Commitment = `Poseidon(nullifier, secret, creator, tier)`.** Built
  client-side, so the pool never learns the secret.
- **Supporter-signed deposit.** `deposit(from, tier, commitment)` pulls `tier`
  USDC from `from` (Freighter signature) into the pool, then appends the leaf.
- **Domain-separated nullifiers.** `nullifier_hash = H(nullifier, domain, sub_id)`
  — WITHDRAW(1), MESSAGE(2), VOTE(3, sub_id = poll). One deposit does each once.
- **Relayed actions.** `withdraw` / `post` / `vote` need no auth — trust is the
  ZK proof + single-use nullifier. The server relays them so the tx source does
  not link back to the supporter.
- **Recipient binding (no registry).** The depositor names the payout `recipient`
  at withdraw time; it is bound into the proof via `action_data ==
keccak256(recipient_strkey) mod r`, so a relayer cannot redirect funds.
- **Action binding.** `action_data` (public) is `keccak256(recipient)` for
  withdraw, `keccak256(message)` for messages, the vote choice for votes —
  checked on-chain.
- **Stake-weighted voting.** A vote adds its deposit `tier` to the tally (not +1),
  so influence is proportional to money staked and immune to splitting into cheap
  deposits (1×$100 == 100×$1). One vote per (deposit, poll).
- **Bounded root history.** Each deposit changes that tier's root. The last
  `ROOT_HISTORY_SIZE` (30) roots per tier are kept in a ring buffer so a proof
  built against a recent root still verifies while another deposit lands; roots
  older than that are evicted, keeping storage bounded.

## Interface

| fn                                          | auth  | purpose                                                   |
| ------------------------------------------- | ----- | --------------------------------------------------------- |
| `__constructor(admin, verifier, token)`     | —     | set admin, verifier, USDC SAC                             |
| `create_poll(creator, poll_id, options)`    | admin | open a poll with N choices                                |
| `deposit(from, tier, commitment) -> u32`    | from  | pull USDC, append commitment, return leaf index           |
| `withdraw(public_inputs, proof, recipient)` | none  | verify (recipient bound in proof), pay `recipient` `tier` |
| `post(public_inputs, proof, message)`       | none  | verify, record an anonymous message                       |
| `vote(public_inputs, proof, choice)`        | none  | verify, add the deposit tier to the tally                 |
| `get_wall(creator) -> Vec<AnonMessage>`     | none  | a creator's anonymous wall (message + tier)               |
| `get_tally(creator, poll_id) -> Vec<i128>`  | none  | stake-weighted vote totals (stroops) per choice           |
| `get_root(tier)` / `get_leaves(tier)`       | none  | tier root / leaves (client rebuilds the path)             |
| `is_nullifier_used(nf) -> bool`             | none  | nullifier spent check                                     |

`public_inputs` = `[root, nullifier_hash, creator, tier, domain, sub_id,
action_data]` (7 x 32 bytes).

## TODO (not production-hardened)

- [ ] Re-measure per-action instruction cost on testnet.

## Build

```bash
stellar contract build   # -> target/wasm32v1-none/release/patronage.wasm
```
