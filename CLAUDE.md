# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Glint is a micropayment tipping dApp on Stellar (testnet only). Creators receive USDC tips two ways:

- **Public tipping** — x402 USDC tip with a note on a public wall; works for browsers and AI agents over HTTP.
- **Private Patronage (ZK)** — the headline feature. A supporter makes one fixed-amount deposit into a shared pool, then takes anonymous on-chain-verifiable actions (private payment to the creator, anonymous "$X supporter" message, stake-weighted poll vote), none linkable to their wallet. Tornado-style pattern: deposit a commitment, later prove Merkle membership and reveal a single-use nullifier.

## Commands

Package manager is pnpm (pinned via `packageManager`; run `corepack enable pnpm` once). Setup: `pnpm install`, then `cp .env.example .env.local`.

- `pnpm dev` — Next.js dev server at http://localhost:3000
- `pnpm build` — production build
- `pnpm lint` — Biome check (CI runs `pnpm biome check src/`)
- `pnpm format` — Biome format --write
- `pnpm tsc --noEmit` — typecheck (no dedicated script; CI runs it)
- `pnpm contract:build` / `pnpm contract:test` — build/test the **tipjar** contract only
- Patronage contract: `cd contracts/patronage && stellar contract build`; tests: `cargo test -p patronage` (from `contracts/patronage/`); single test: `cargo test -p patronage <test_name>`
- Circuit: `cd circuits/patronage && nargo compile`, then `bb write_vk --scheme ultra_honk --oracle_hash keccak -b target/glint_patronage.json --output_format bytes_and_fields -o target`
- `pnpm deploy:tipjar` — deploy tipjar to testnet; `pnpm server:address` — show server signer address

There is **no JS test framework**. Validation = `pnpm tsc --noEmit` + `pnpm lint` + `pnpm build`, plus tsx scripts:

- `pnpm tsx scripts/poseidon-check.ts` — bb.js ↔ Noir ↔ Rust Poseidon parity
- `pnpm tsx scripts/verify-proof.ts` — prove circuit + verify on deployed verifier (no USDC)
- `pnpm tsx scripts/patronage-e2e.ts` — full testnet deposit → proof → post → wall flow
- `pnpm test:x402` — x402 tip flow against `TEST_URL`

CI (`.github/workflows/deploy.yml`) runs biome + tsc + build only (no Rust tests), then deploys to Cloud Run on push to `main`.

## Architecture

Three cooperating layers:

1. **Next.js app + API relayer** (`src/`) — App Router, React 19, Tailwind v4. Path alias `@/*` → `./src/*`.
2. **Soroban contracts** (`contracts/`) — two **separate** Cargo workspaces, each nested one level (e.g. `contracts/patronage/contracts/patronage/src/lib.rs`):
   - `tipjar` (soroban-sdk 25) — public tip wall; the server admin is the only writer, calling `record_tip` after x402 settlement.
   - `patronage` (soroban-sdk 26 — required for BN254 host functions, **do not downgrade**) — privacy pool: one Merkle tree per fixed tier ($0.1/$1/$5/$10/$100), 30-root history ring buffer per tier, domain-separated nullifiers (WITHDRAW=1, MESSAGE=2, VOTE=3 with sub_id=poll), recipient binding via `action_data == keccak256(recipient) mod r`. Verifies proofs by cross-contract call to an external UltraHonk verifier. Each contract dir has its own README with full details.
3. **Noir circuit** (`circuits/patronage/src/main.nr`) — one unified circuit / one VK / one verifier serves all three actions. `TREE_DEPTH = 20`, Poseidon2. **7 positional public inputs** `[root, nullifier_hash, creator, tier, domain, sub_id, action_data]` — the contract parses them positionally; read the circuit header comment before changing anything.

### Private patronage data flow (spans several files)

1. **Deposit** (the only wallet-signed step): browser builds a secret note and `commitment = Poseidon(nullifier, secret, creator, tier)` (`src/lib/patronage/notes.ts`, `deposit.ts`) and calls the pool's `deposit` via Freighter; the note is stored in browser localStorage keyed by wallet+creator.
2. **Act** (no wallet, no signature): browser fetches raw leaves from `/api/patronage/leaves`, rebuilds the Merkle path locally (`merkle.ts`), generates an UltraHonk proof in-browser with noir_js + bb.js (`client.ts`), and POSTs it to `/api/patronage/{withdraw,post,vote}`. The server (`server.ts`) relays the tx from the server keypair, so the action is unlinkable to the deposit. **The server never runs bb.js — proving is browser-only.**
3. **See**: activity wall / polls read an off-chain index (Firestore in prod, JSON files in `.data/` locally, chosen by `STORE_TYPE`), each item deep-linking to its on-chain tx.

Other key modules: `src/lib/stellar.ts` + `soroban-tx.ts` (chain access), `x402-server.ts` (payment middleware), `hd-wallet.ts` (server signer derivation), `creators/` (store abstraction), `src/stores/wallet.ts` (zustand). The browser gets the pool contract id at runtime from `/api/patronage/config` — contract ids are server env vars (`TIPJAR_CONTRACT_ID`, `PATRONAGE_CONTRACT_ID`), not `NEXT_PUBLIC_*`.

## Critical constraints

- **Noir toolchain is pinned**: nargo `1.0.0-beta.9` + bb `0.87.0` must match the deployed on-chain UltraHonk verifier. Don't bump `@noir-lang/noir_js` / `@aztec/bb.js` casually.
- `@aztec/bb.js` and `@noir-lang/noir_js` are in `serverExternalPackages` (`next.config.ts`) to keep ZK wasm out of the bundler; build output is Next.js `standalone` (Docker → Cloud Run).
- Testnet only. The server keypair (derived from `TEST_MNEMONIC`, SEP-0005 path index `SERVER_ACCOUNT_INDEX=2`) is both pool admin and relayer. Keep secrets in gitignored `.env.local`.
- Lint/format is **Biome** (2-space indent), not eslint/prettier.
