# Anonymous Patronage — Integration Guide

ZK feature: let a supporter prove "I tipped this creator" and post a **verified
anonymous** message, without revealing their wallet or payment. "Patronage" =
backing a creator financially; this makes that support *speak anonymously*.

Feasibility + on-chain cost are validated on testnet — see
[`zk-hackathon-feasibility.md`](./zk-hackathon-feasibility.md) (full withdraw
83.77M / 100M instructions).

## Architecture

```
Tip time (TipForm)                 Post time (AnonPostForm)
  client builds note                 client fetches Merkle path  ──> /api/patronage/path
  commitment ──> /api/tip/[slug] ─┐  client generates UltraHonk proof (noir_js + bb.js)
                                  │  proof + message ──────────> /api/patronage/post
  server deposits commitment  <───┘  server relays post() on-chain
  into patronage pool                 AnonWall reads get_wall  <── /api/patronage/wall/[slug]
```

- **Global pool**, one Merkle tree across all creators (max anonymity set).
- **Commitment** = `Poseidon(nullifier, secret, creator)`, built client-side.
- **`deposit`** is admin-gated (server, after x402 settles). **`post`** is open
  (trust = proof + nullifier); the server relays it so the tx source is unlinkable.
- **Message binding**: `msg_hash` is a public input; the contract checks
  `keccak256(message) mod r == msg_hash`.

## How it works — and why it MUST be two steps

The tip and the anonymous post are deliberately separate user actions. This is
the security model, not UX friction:

- A **tip is a public, wallet-signed payment** (x402, your wallet → creator). It
  reveals your wallet on-chain — that is unavoidable.
- If the anonymous message rode along *with* the tip, anyone could link
  `your wallet → that message`. No anonymity.
- So the pool splits it: the tip **deposits a commitment** (linkable to you), and
  **later** you prove "I am *one of* the depositors for this creator" + reveal a
  one-time `nullifier`, **without revealing which deposit is yours**. Anonymity =
  the set of all depositors + decoupling the post from the deposit (timing,
  session). Auto-posting right after a tip would re-link the two and defeat it.

**Anti-spam (Sybil resistance):** each deposit note carries a unique `nullifier`,
and the contract rejects a reused one — so **one tip = exactly one anonymous post**.
Posting more messages requires more tips (real USDC). Tip N times → N independent
notes → N posts; the posts are not linkable to each other either.

## Files

| Path | Role |
|---|---|
| `circuits/patronage/` | Noir circuit (membership + nullifier + creator + msg bind) |
| `contracts/patronage/` | Soroban pool contract (`deposit`, `post`, `get_wall`, …) |
| `src/lib/patronage/fields.ts` | field/keccak helpers (creator + msg_hash) |
| `src/lib/patronage/poseidon.ts` | Poseidon2 via @aztec/bb.js (matches the circuit + contract) |
| `src/lib/patronage/server.ts` | server client: deposit / post / wall / Merkle path |
| `src/lib/patronage/client.ts` | browser: note gen + UltraHonk proof |
| `src/lib/patronage/notes.ts` | localStorage deposit-note storage |
| `src/app/api/patronage/{path,post,wall}/` | API routes |
| `src/app/api/tip/[slug]/route.ts` | tip route, now deposits the commitment |
| `src/components/creator/AnonPostForm.tsx`, `AnonWall.tsx` | UI |

## Deployed (testnet)

| What | Contract ID |
|---|---|
| Patronage pool (**demo**, admin = server keypair) | `CATIQJAXYI422JJJSZHUXMCDQA7TKITLNVNO7HPC2FWG6H6GCQBGUXAU` |
| UltraHonk verifier (patronage vk) | `CBQRARZTFSB5VZD55UBCY4F2BH34QZ3A6AOBVNS2I2I6Y5QE6USYQTLJ` |

The demo pool's admin is the Glint server keypair (`TEST_MNEMONIC` index 2,
address `GA7EALDD5PJYUIJR6BHXAR7FN2XP6PSXWKVJXSSGDX5UWPPX4TFV3ATA`, friendbot-funded),
so the app's `deposit` (admin) and `post` (relayer) both sign correctly.

## Env vars

```
PATRONAGE_CONTRACT_ID=C...          # the pool contract
TEST_MNEMONIC=...                   # server signer (reused from TipJar) = pool admin
SERVER_ACCOUNT_INDEX=2              # reused from TipJar
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

## Build

```bash
# circuit -> vk
cd circuits/patronage && nargo compile && \
  bb write_vk --scheme ultra_honk --oracle_hash keccak \
    --bytecode_path target/glint_patronage.json --output_path target --output_format bytes_and_fields
# contract -> wasm
cd contracts/patronage && stellar contract build
# JS deps
pnpm install
```

## What is validated (and how)

Tested against live testnet — not just typecheck:

- **Contract** (`deposit`, `post`, `get_wall`, `get_root`, `get_leaves`) — real txs.
- **Circuit + UltraHonk proof** — proof verifies on-chain inside `post`.
- **Poseidon** matches across bb.js ↔ Noir ↔ Rust contract (`scripts/poseidon-check.ts`,
  and JS-rebuilt Merkle root == on-chain root).
- **`/api/patronage/path`** over HTTP (real `next` runtime): `get_leaves` read +
  multi-leaf `buildMerklePath` + server-side bb.js Poseidon → returned a valid path.
- **`/api/patronage/post`** over HTTP: server relayed the proof, it verified
  on-chain, and the message appeared on the wall (`txHash` returned, 200).
- **`next build`** compiles the whole app including the ZK client bundle.
- Required config: `serverExternalPackages: ["@aztec/bb.js", "@noir-lang/noir_js"]`
  in `next.config.ts` (otherwise the bundler breaks bb.js's wasm path resolution).

**Browser-validated (manual pass on testnet).** The full UI flow was run in a real
browser with Freighter: tipped a creator (commitment generated client-side with
bb.js + deposited), then posted an anonymous message (proof generated **in the
browser**, relayed, verified on-chain) — the message appeared on the Anonymous
wall as a "verified supporter", with no wallet shown.

Known UX gap: after tipping, `AnonPostForm` only reads the saved note on mount, so
it needs a page refresh to unlock. Wiring it to the existing `tip-sent` event would
make it live.

To run: set `PATRONAGE_CONTRACT_ID` (demo pool above) in `.env.local`, `pnpm dev`,
open a creator page, tip, then post anonymously.

## Reference: full pipeline proven via script

`scripts/patronage-e2e.ts` runs the whole flow on testnet
(commitment → deposit → Merkle path → UltraHonk proof → on-chain `post` → wall):

- **Poseidon matches across all three impls.** `@aztec/bb.js poseidon2Hash` is
  byte-for-byte identical to the Noir circuit and the Rust contract — verified by
  `scripts/poseidon-check.ts` and by the JS-rebuilt Merkle root matching the
  on-chain root exactly. `poseidon.ts` uses bb.js directly (no stub).
- **Proof verifies on-chain.** `post` succeeded: the UltraHonk proof verified, the
  Merkle root matched, the nullifier was recorded, and the `keccak256(message)`
  binding passed — the message appeared on the wall.
- Example run: pool `CBLVZH2WUIV2XF4L4U3XUY72B2IB5BQGD42CLNJFNVTDEAHWMPAEIN5Y`,
  post tx `e861aa8a40f422848a51886b6e1dec78953fa315d283aceab0843adaa4344ab0`.

## Current limitations (by design, stated plainly)

- **Single tier.** "Tipped >= $X" amount tiers (one tree per tier) are not built;
  the pool proves "verified supporter of creator C". Hidden per-commitment amounts
  are intentionally avoided (the server cannot verify a hidden amount).
- **Root history is unbounded** (`KnownRoot` never evicts) — fine for a demo.
- **Note backup**: the deposit note (secret) is localStorage-only; losing it (clear
  cache / other browser) means losing the ability to post. Add an export/download.
- **Live unlock**: `AnonPostForm` needs a page refresh after a tip (see above).
- The demo pool + verifier run on **testnet** with the dev server keypair as admin.
  Redeploy fresh for any other environment.
