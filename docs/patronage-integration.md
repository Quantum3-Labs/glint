# Private Patronage — Integration Guide

ZK feature: one private deposit lets a supporter take several **anonymous,
proof-backed** actions for a creator — pay them privately, post a verified
anonymous message, and vote in polls — none of it linkable to their wallet.

## Architecture

```
Deposit (PrivatePatronage)            Actions (usePatronage)
  client builds note + commitment       client fetches tier leaves ─> /api/patronage/leaves?tier=
  Freighter signs deposit(from,         client rebuilds Merkle path + generates the
    tier, commitment) ──> POOL            UltraHonk proof in-browser (noir_js + bb.js)
  USDC pulled into the pool             proof ─> /api/patronage/{withdraw,post,vote}
                                          server relays the tx (source ≠ depositor)
                                        AnonWall / Polls read ─> /api/patronage/{wall,poll}/[slug]
```

The server runs **no bb.js**: it only returns the raw leaf list; the path is
rebuilt in the browser (which already loads bb.js for proving).

- **Tier pools.** Each fixed denomination ($0.1/$1/$5/$10/$100) has its own Merkle tree.
  `tier` is bound into the commitment AND a public input, so a $1 deposit can't
  withdraw $10.
- **Commitment** = `Poseidon(nullifier, secret, creator, tier)`, built client-side.
- **Deposit** is signed by the supporter (Freighter) — the pool custodies the
  USDC. No x402, no server. `withdraw` / `post` / `vote` are relayed by the
  server so the tx source is unlinkable; trust = proof + single-use nullifier.
- **Domain-separated nullifiers**: `nullifier_hash = H(nullifier, domain, sub_id)`
  — WITHDRAW(1), MESSAGE(2), VOTE(3, sub_id = poll). One deposit does each once.
- **Payout binding**: `creator = keccak256(slug)` is not a wallet, so the admin
  registers `creator -> wallet` (`register_payout`); `withdraw` pays that wallet.
- **Action binding**: `action_data` (public) is recipient-less for withdraw,
  `keccak256(message)` for message, the vote choice for vote — checked on-chain.

## Unified circuit

Public inputs (positional): `[root, nullifier_hash, creator, tier, domain,
sub_id, action_data]`. One circuit + one VK + one verifier instance serve all
three actions. See `circuits/patronage/src/main.nr`.

## Files

| Path | Role |
|---|---|
| `circuits/patronage/` | Noir unified circuit (membership + domain nullifier + tier + action bind) |
| `contracts/patronage/` | Soroban pool: `deposit`, `withdraw`, `post`, `vote`, `register_payout`, `create_poll`, reads |
| `src/lib/patronage/fields.ts` | field/keccak helpers + `DOMAIN` + `TIERS` |
| `src/lib/patronage/poseidon.ts` | Poseidon2 via bb.js (commitment + domain nullifier) |
| `src/lib/patronage/merkle.ts` | client-side Merkle-path rebuild (bb.js) |
| `src/lib/patronage/client.ts` | browser: note gen + withdraw/message/vote proofs |
| `src/lib/patronage/deposit.ts` | browser: Freighter-signed `deposit` into the pool |
| `src/lib/patronage/server.ts` | server relay + admin + reads (no bb.js) |
| `src/lib/patronage/use-patronage.ts` | hook: notes + spent-filter + deposit/withdraw/message/vote |
| `src/lib/polls.ts` | poll metadata store (JSON / Firestore) |
| `src/app/api/patronage/{config,leaves,withdraw,post,vote,spent,wall,poll,register}/` | API routes |
| `src/components/creator/PrivatePatronage.tsx`, `PatronagePolls.tsx`, `AnonWall.tsx` | supporter UI |
| `src/components/creator/dashboard/PatronageAdmin.tsx` | creator UI (enable payout + open polls) |

## Env vars

```
PATRONAGE_CONTRACT_ID=C...          # the pool contract (server + /api/patronage/config)
TEST_MNEMONIC=...                   # server signer = pool admin + relayer
SERVER_ACCOUNT_INDEX=2
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STORE_TYPE=firestore                # prod (polls + creators); JSON files for local dev
```

The browser reads the contract id from `/api/patronage/config` at runtime, so no
`NEXT_PUBLIC_*` contract id is baked into the bundle (Cloud Run friendly).

## Deploy

The contract interface changed (USDC custody + multi-tier + voting), and the VK
changed (7 public inputs) — **redeploy both the verifier and the pool**.

```bash
# 1. circuit -> vk (7 public inputs)
cd circuits/patronage && nargo compile && \
  bb write_vk --scheme ultra_honk --oracle_hash keccak \
    -b target/glint_patronage.json --output_format bytes_and_fields -o target

# 2. deploy a verifier instance with this vk (rs-soroban-ultrahonk tooling)

# 3. pool -> wasm, deploy with constructor(admin, verifier, token)
cd contracts/patronage && stellar contract build
stellar contract deploy --wasm target/.../patronage.wasm -- \
  --admin <SERVER_PUBKEY> --verifier <VERIFIER_ID> --token <USDC_SAC>

# 4. set PATRONAGE_CONTRACT_ID (GitHub var + .env.local)
```

Per creator: open the dashboard and click **Enable / re-register payout** (calls
`register_payout`), then optionally **Open a poll**. Supporters need a USDC
trustline + testnet USDC to deposit.

## Validation

- `pnpm tsc --noEmit`, `pnpm biome check`, and `pnpm build` are clean.
- Contract compiles to wasm; circuit compiles; Poseidon (commitment + nullifier)
  matches bb.js ↔ Noir ↔ Rust (`scripts/poseidon-check.ts`).
- `scripts/patronage-e2e.ts` drives the message flow end-to-end on testnet
  (deposit → Merkle path → UltraHonk proof → on-chain `post` → wall). Set
  `USDC_SAC` for your environment before running.

## Current limitations (by design)

- **Five tiers** ($0.1/$1/$5/$10/$100). Add denominations in `fields.ts` `TIERS` +
  contract `is_valid_tier`.
- **Root history is unbounded** (`KnownRoot` never evicts) — fine for a demo.
- **Note backup**: the deposit note (secret) is localStorage-only; losing it
  means losing the ability to act on that deposit. Add an export/download.
- **Anonymity needs time**: depositing then immediately withdrawing in an empty
  pool links the two by timing. The set grows with depositors.
- Testnet only, dev server keypair as admin/relayer. Redeploy fresh elsewhere.
