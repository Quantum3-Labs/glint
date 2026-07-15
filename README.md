# Glint

Micropayment tipping dApp on Stellar. Creators receive USDC tips directly,
On top of tipping, Glint adds a **zero-knowledge privacy layer**: a supporter can
back a creator **anonymously**, with every action still provable on-chain.

Two ways to support a creator:

- **Support privately (ZK)** — one private deposit into a pool, then several
  anonymous actions that no one can link back to your wallet.

- Tip publicly — an x402 USDC tip with a note on the public wall. with
  zero platform fees, it works for both humans (browser) and AI agents (HTTP).

The private path is the ZK feature and the focus of this README — see
[Private Patronage](#private-patronage-zk).

## Tech stack

- [Next.js](https://nextjs.org/) 16 (App Router, TypeScript, Turbopack)
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Biome](https://biomejs.dev/) (linting + formatting)
- [@stellar/stellar-sdk](https://www.npmjs.com/package/@stellar/stellar-sdk) — Stellar network client
- [@stellar/freighter-api](https://www.npmjs.com/package/@stellar/freighter-api) — Freighter wallet connect
- [x402-stellar](https://www.npmjs.com/package/x402-stellar) — x402 payment protocol on Stellar
- [Noir](https://noir-lang.org/) + UltraHonk (`bb.js`) — in-browser ZK proving
- [Soroban](https://developers.stellar.org/docs/build/smart-contracts) — TipJar, patronage pool, and UltraHonk verifier contracts
- pnpm (via corepack)

## Setup

```bash
corepack enable pnpm   # first time only
pnpm install
cp .env.example .env.local
pnpm dev               # http://localhost:3000
```

**Requirements:** Node.js >= 20.9.0 and a Stellar wallet
([Freighter](https://freighter.app/)) with testnet XLM + USDC.

**Scripts:** `pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm format`.

---

# Private Patronage (ZK)

**One private deposit lets a supporter take several anonymous, on-chain-verifiable
actions for a creator — none of them linkable to their wallet.**

From a single deposit into a shared pool, a supporter can:

1. **Pay the creator privately** — the pool pays out; unlinkable to the deposit.
2. **Post an anonymous message** — shown as a verified "$X supporter", no wallet.
3. **Vote in a poll** — stake-weighted, one vote per poll per deposit.

The ZK is load-bearing: without it there is no anonymity. It follows the classic
privacy-pool / Tornado pattern — deposit a `commitment`, later prove Merkle
membership and reveal a single-use `nullifier` to act, without revealing which
deposit is yours.

## How it works

Three steps. Step 1 uses the supporter's wallet; steps 2–3 never do.

```
STEP 1 — DEPOSIT  (once, signed by the supporter's wallet)

   supporter's browser                          Pool contract (Soroban)
   ┌──────────────────────────┐    deposit()    ┌────────────────────────┐
   │ build a secret note      │ ──────────────► │ pull USDC into the pool│
   │ + commitment, sign with  │   (Freighter)   │ add commitment to the  │
   │ Freighter                │                 │ tier's Merkle tree     │
   └──────────────────────────┘                 └────────────────────────┘


STEP 2 — ACT  (any time later — NO wallet, NO signature)

   supporter's browser                          server (relayer)         Pool
   ┌──────────────────────────┐   proof over   ┌───────────────┐
   │ prove "my commitment is  │ ─────────────► │ relay the tx  │ ──► withdraw / post / vote
   │ in the tree" (noir_js +  │  POST /api/    │ (tx source =  │     (verified on-chain,
   │ bb.js), reveal nullifier │  patronage/*   │  the server)  │      single-use nullifier)
   └──────────────────────────┘                └───────┬───────┘
                                                       │ also records the action
                                                       ▼ off-chain, with its tx hash

STEP 3 — SEE  (anyone)

   Activity wall / Polls ── read ──► each item links to its on-chain tx,
                                     proving the source is the server, not a wallet.
```

- **Step 1** is the only step the supporter signs. The pool custodies the USDC.
- **Step 2** carries only a proof and is **relayed by the server**, so the tx source
  is never the supporter's wallet. Trust comes entirely from the proof + a
  single-use nullifier — no signature, and the action is unlinkable to the deposit.
- The **server runs no `bb.js`**: it just returns the raw leaf list; the Merkle path
  and the proof are built in the browser (which already loads `bb.js`).

## Design decisions

- **Fixed tiers, one tree each.** Deposits come in fixed amounts
  ($0.1 / $1 / $5 / $10 / $100), and each denomination has its own Merkle tree.
  Fixed amounts make deposits look identical; the `tier` is bound into the proof,
  so a $1 deposit can never withdraw $10.
- **Commitment** = `Poseidon(nullifier, secret, creator, tier)`, computed in the
  browser — the pool never learns the secret.
- **Domain-separated nullifiers.** `nullifier_hash = H(nullifier, domain, sub_id)`
  with `domain` = WITHDRAW / MESSAGE / VOTE (and `sub_id` = poll id for votes).
  One deposit can pay once, message once, and vote once **per poll** — each action
  reveals a different nullifier, so they can't be linked to each other either.
- **Recipient binding, no registry.** The supporter names the payout `recipient`
  when proving; it is bound into the proof via
  `action_data == keccak256(recipient) mod r`. The relayer therefore cannot
  redirect funds, and creators need no setup to receive private payments.
- **Stake-weighted voting.** A vote adds its deposit `tier` to the tally (not +1),
  so influence is proportional to money staked and immune to splitting one big
  deposit into many cheap ones (1×$100 == 100×$1). It is a _money gate_, not a bot
  filter — true one-person-one-vote needs proof-of-personhood (out of scope).
- **Bounded root history.** Each deposit changes that tier's root; the pool keeps
  the last 30 roots per tier in a ring buffer, so a proof stays valid while other
  deposits land, without storage growing forever.
- **Activity wall.** The server indexes every relayed action with its tx hash into
  an off-chain store, so the public feed can link each item to its on-chain tx —
  making the unlinkability visible. On-chain reads stay the source of truth.

## Unified circuit

One Noir circuit, one verification key, one verifier instance serve all three
actions. Its 7 public inputs (positional) are:

```
[root, nullifier_hash, creator, tier, domain, sub_id, action_data]
```

`action_data` binds the action: `keccak(recipient)` for a payment,
`keccak(message)` for a message, the vote `choice` for a vote — all checked
on-chain. See [`circuits/patronage/src/main.nr`](circuits/patronage/src/main.nr).
The circuit is unchanged by the stake-weighting (that lives in the contract tally).

## Contracts (testnet)

| What                                                             | Contract ID                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Patronage pool (USDC custody, tier trees, stake-weighted voting) | [`CBIF3QGK3K6YPYWD3JXAMK2POAZYTXHQOJ2CCLN2E4OIJ3DUXYZM6HZ4`](https://stellar.expert/explorer/testnet/contract/CBIF3QGK3K6YPYWD3JXAMK2POAZYTXHQOJ2CCLN2E4OIJ3DUXYZM6HZ4) |
| UltraHonk verifier (patronage VK)                                | [`CAQQYBTA2Q5GOFTL5VDZMM6UIPMOCGYKYSCN53UN63ESTTPWNBQOOPFI`](https://stellar.expert/explorer/testnet/contract/CAQQYBTA2Q5GOFTL5VDZMM6UIPMOCGYKYSCN53UN63ESTTPWNBQOOPFI) |
| USDC SAC (testnet)                                               | [`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |

The pool admin/relayer is the Glint server keypair
([`GA7EALDD5PJYUIJR6BHXAR7FN2XP6PSXWKVJXSSGDX5UWPPX4TFV3ATA`](https://stellar.expert/explorer/testnet/account/GA7EALDD5PJYUIJR6BHXAR7FN2XP6PSXWKVJXSSGDX5UWPPX4TFV3ATA)). Contract-level
detail lives in [`contracts/patronage/README.md`](contracts/patronage/README.md)
(the private pool) and [`contracts/tipjar/README.md`](contracts/tipjar/README.md)
(the public tip wall).

## Deploy

The verifier VK only changes when the circuit changes. The pool must be
redeployed whenever the contract changes.

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

# 4. set PATRONAGE_CONTRACT_ID (.env.local locally, GitHub Actions var for Cloud Run)
```

Creators need no setup for private payments (the supporter binds the recipient in
the proof). Open a poll from the **New poll** button in your own profile header.
Supporters need a USDC trustline + testnet USDC to deposit.

## Environment

```
PATRONAGE_CONTRACT_ID=C...          # the pool contract (server + /api/patronage/config)
TEST_MNEMONIC=...                   # server signer = pool admin + relayer
SERVER_ACCOUNT_INDEX=2
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STORE_TYPE=firestore                # prod (creators + polls + activity); JSON files for local dev
```

The browser reads the contract id from `/api/patronage/config` at runtime, so no
`NEXT_PUBLIC_*` contract id is baked into the bundle (Cloud Run friendly).

## Validation

- `pnpm tsc --noEmit`, `pnpm biome check`, and `pnpm build` are clean.
- `cargo test -p patronage` — 19 unit tests over the pool logic (a mock verifier
  isolates the cross-call): deposit/withdraw/post/vote happy paths, double-spend,
  unknown/evicted root, wrong domain, recipient + message binding, cross-tier
  replay, verification failure, and root-history eviction.
- Poseidon (commitment + nullifier) matches bb.js ↔ Noir ↔ Rust
  (`scripts/poseidon-check.ts`).
- `scripts/verify-proof.ts` proves the circuit and verifies it on the deployed
  verifier (no USDC needed).
- `scripts/patronage-e2e.ts` drives the message flow end-to-end on testnet
  (deposit → Merkle path → proof → on-chain `post` → wall).

## Limitations (by design / known)

- **Note backup.** The deposit note (the secret) lives in the browser's
  localStorage, keyed by wallet + creator, so each account sees only its own
  notes. It is not backed up — losing the browser store loses the ability to act
  on that deposit.
- **Stake-weighted, not one-person-one-vote** (see design decisions above).
- **Activity feed is an off-chain index** — server-trusted for display, but every
  item is still verifiable via its on-chain tx.
- **Anonymity needs a crowd.** Depositing then immediately acting in an empty pool
  links the two by timing; the anonymity set grows with the number of depositors.
- **Testnet only**, with a dev server keypair as admin/relayer. Redeploy fresh for
  any other environment.
