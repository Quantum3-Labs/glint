# Glint

Micropayment tipping dApp on Stellar. Creators receive USDC tips directly, with zero platform fees. Built on the x402 payment protocol — works for both humans (browser) and AI agents (HTTP).

Two ways to support a creator:

- **Tip publicly** — an x402 USDC tip with a note on the public wall.
- **Support privately (ZK)** — one private deposit into a Tornado-style pool lets a supporter take several **anonymous, on-chain-verifiable** actions for a creator (pay them privately, post a verified anonymous message, and vote in polls), none of it linkable to their wallet. Proving is in-browser (Noir + UltraHonk); a Soroban verifier checks the proof on-chain. See [`docs/patronage-integration.md`](docs/patronage-integration.md).

## Tech stack

- [Next.js](https://nextjs.org/) 16 (App Router, TypeScript, Turbopack)
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Biome](https://biomejs.dev/) (linting + formatting)
- [@stellar/stellar-sdk](https://www.npmjs.com/package/@stellar/stellar-sdk) — Stellar network client
- [@stellar/freighter-api](https://www.npmjs.com/package/@stellar/freighter-api) — Freighter wallet connect
- [x402-stellar](https://www.npmjs.com/package/x402-stellar) — x402 payment protocol on Stellar
- [Noir](https://noir-lang.org/) + UltraHonk (`bb.js`) — in-browser ZK proving for private patronage
- [Soroban](https://developers.stellar.org/docs/build/smart-contracts) — TipJar + patronage pool + UltraHonk verifier contracts
- pnpm (via corepack)

## Setup

```bash
# Enable pnpm via corepack (first time only)
corepack enable pnpm

# Install dependencies
pnpm install

# Copy env vars
cp .env.example .env.local

# Run dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Requirements

- Node.js >= 20.9.0
- A Stellar wallet ([Freighter](https://freighter.app/)) with testnet XLM + USDC

## Scripts

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm start` — run production build
- `pnpm lint` — run Biome checks
- `pnpm format` — format code with Biome
