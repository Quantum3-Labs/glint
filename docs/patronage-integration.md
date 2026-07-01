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
                                          + appends an off-chain activity item (+ tx hash)
                                        Activity / Polls read ─> /api/patronage/{activity,poll}/[slug]
```

The server runs **no bb.js**: it only returns the raw leaf list; the path is
rebuilt in the browser (which already loads bb.js for proving).

- **Tier pools.** Each fixed denomination ($0.1/$1/$5/$10/$100) has its own Merkle
  tree. `tier` is bound into the commitment AND a public input, so a $1 deposit
  can't withdraw $10.
- **Commitment** = `Poseidon(nullifier, secret, creator, tier)`, built client-side.
- **Deposit** is signed by the supporter (Freighter) — the pool custodies the
  USDC. No x402, no server. `withdraw` / `post` / `vote` are relayed by the
  server so the tx source is unlinkable; trust = proof + single-use nullifier.
- **Domain-separated nullifiers**: `nullifier_hash = H(nullifier, domain, sub_id)`
  — WITHDRAW(1), MESSAGE(2), VOTE(3, sub_id = poll). One deposit does withdraw
  once, message once, and one vote **per poll**.
- **Recipient binding (no registry)**: the depositor names the payout `recipient`
  at withdraw time, bound into the proof via `action_data ==
  keccak256(recipient_strkey) mod r`, so the relayer cannot redirect funds. No
  creator setup needed for private payments.
- **Action binding**: `action_data` (public) is `keccak256(recipient)` for
  withdraw, `keccak256(message)` for message, the vote choice for vote — checked
  on-chain.
- **Stake-weighted voting**: a vote adds its deposit `tier` to the tally (not +1),
  so influence is proportional to money staked and immune to splitting into cheap
  deposits (1×$100 == 100×$1). A supporter with N notes can cast each once.
- **Activity wall**: the server indexes every relayed action (payment/message/vote)
  with its tx hash into an off-chain store, so the public feed can link each item
  to its on-chain tx. On-chain (`get_wall`/`get_tally`) stays the source of truth;
  the log is a display index. No wallet is stored — actions are relayed.

## Unified circuit

Public inputs (positional): `[root, nullifier_hash, creator, tier, domain,
sub_id, action_data]`. One circuit + one VK + one verifier instance serve all
three actions. See `circuits/patronage/src/main.nr`. The circuit is unchanged by
the stake-weighting (weighting lives entirely in the contract tally).

## Files

| Path | Role |
|---|---|
| `circuits/patronage/` | Noir unified circuit (membership + domain nullifier + tier + action bind) |
| `contracts/patronage/` | Soroban pool: `deposit`, `withdraw`, `post`, `vote`, `create_poll`, reads |
| `src/lib/patronage/fields.ts` | field/keccak helpers + `DOMAIN` + `TIERS` + `publicInputField` |
| `src/lib/patronage/poseidon.ts` | Poseidon2 via bb.js (commitment + domain nullifier) |
| `src/lib/patronage/merkle.ts` | client-side Merkle-path rebuild (bb.js) |
| `src/lib/patronage/client.ts` | browser: note gen + withdraw/message/vote proofs |
| `src/lib/patronage/deposit.ts` | browser: Freighter-signed `deposit` into the pool |
| `src/lib/patronage/server.ts` | server relay + admin + reads (no bb.js) |
| `src/lib/patronage/activity.ts` | off-chain activity index (JSON / Firestore) |
| `src/lib/patronage/use-patronage.ts` | hook: notes + spent-filter + deposit/withdraw/message/vote |
| `src/lib/polls.ts` | poll metadata store (JSON / Firestore) |
| `src/app/api/patronage/{config,leaves,withdraw,post,vote,spent,wall,poll,activity}/` | API routes |
| `src/components/creator/ProfileTabs.tsx` | "Tip publicly" vs "Support privately" tabs |
| `src/components/creator/PrivatePatronage.tsx`, `PatronagePolls.tsx`, `ActivityWall.tsx` | supporter UI |
| `src/components/creator/OwnerPollButton.tsx` | owner "New poll" (profile header, modal) |

## Env vars

```
PATRONAGE_CONTRACT_ID=C...          # the pool contract (server + /api/patronage/config)
TEST_MNEMONIC=...                   # server signer = pool admin + relayer
SERVER_ACCOUNT_INDEX=2
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STORE_TYPE=firestore                # prod (creators + polls + activity); JSON files for local dev
```

The browser reads the contract id from `/api/patronage/config` at runtime, so no
`NEXT_PUBLIC_*` contract id is baked into the bundle (Cloud Run friendly).

## Deployed (testnet)

| What | Contract ID |
|---|---|
| Pool (USDC custody, tier-weighted voting) | `CA24QYVHEGC64LP7SML7B2N3FNXBXXCAI4KBZBV3D4PYQDKUWC6FOJXD` |
| UltraHonk verifier (patronage VK) | `CAQQYBTA2Q5GOFTL5VDZMM6UIPMOCGYKYSCN53UN63ESTTPWNBQOOPFI` |
| USDC SAC (testnet) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

Pool admin/relayer = server keypair (`TEST_MNEMONIC` index 2,
`GA7EALDD5PJYUIJR6BHXAR7FN2XP6PSXWKVJXSSGDX5UWPPX4TFV3ATA`).

## Deploy

The verifier VK only changes when the circuit changes. The pool must be
redeployed whenever the contract changes (e.g. the vote-tally weighting).

```bash
# 1. circuit -> vk (only if the circuit changed)
cd circuits/patronage && nargo compile && \
  bb write_vk --scheme ultra_honk --oracle_hash keccak \
    -b target/glint_patronage.json --output_format bytes_and_fields -o target

# 2. deploy a verifier with this vk (rs-soroban-ultrahonk): only if the vk changed
stellar contract deploy --wasm <rs_soroban_ultrahonk.wasm> --source alice \
  --network testnet -- --vk_bytes-file-path circuits/patronage/target/vk

# 3. pool -> wasm, deploy with constructor(admin, verifier, token)
cd contracts/patronage && stellar contract build
stellar contract deploy --wasm target/.../patronage.wasm --source alice \
  --network testnet -- \
  --admin <SERVER_PUBKEY> --verifier <VERIFIER_ID> --token <USDC_SAC>

# 4. set PATRONAGE_CONTRACT_ID (.env.local for local, GitHub Actions var for Cloud Run)
```

Per creator: nothing is required for private payments (the supporter binds the
recipient into their proof). Open a poll from the **New poll** button in your own
profile header for anonymous voting. Supporters need a USDC trustline + testnet
USDC to deposit.

## Validation

- `pnpm tsc --noEmit`, `pnpm biome check`, and `pnpm build` are clean.
- Contract compiles to wasm; circuit compiles; Poseidon (commitment + nullifier)
  matches bb.js ↔ Noir ↔ Rust (`scripts/poseidon-check.ts`).
- `scripts/verify-proof.ts` proves the circuit and verifies it on the deployed
  verifier (no USDC needed) — confirms the VK + 7 public inputs + keccak oracle.
- `scripts/patronage-e2e.ts` drives the message flow end-to-end on testnet
  (deposit → Merkle path → UltraHonk proof → on-chain `post` → wall). Needs a
  USDC-funded `alice`; set `USDC_SAC` for your environment.

## Current limitations (by design / known)

- **Note backup**: the deposit note (secret) lives in localStorage
  (`glint.patronage.notes`), keyed by `owner` wallet + `slug`, so each Freighter
  account sees only its own notes. It is NOT backed up — losing the browser store
  loses the ability to act on that deposit. Add an export/download.
- **Stake-weighted, not one-person-one-vote.** More deposits = more weight (each
  costs real USDC). True Sybil resistance needs proof-of-personhood (out of scope).
- **Activity feed is an off-chain index** (unbounded, server-trusted for display).
  Every item is still verifiable via its on-chain tx; on-chain reads are the
  source of truth.
- **Anonymity needs time**: depositing then immediately withdrawing in an empty
  pool links the two by timing. The set grows with depositors.
- **Root history is unbounded** (`KnownRoot` never evicts) — fine for a demo.
- **Five tiers** ($0.1/$1/$5/$10/$100). Add denominations in `fields.ts` `TIERS` +
  contract `is_valid_tier`.
- Testnet only, dev server keypair as admin/relayer. Redeploy fresh elsewhere.
