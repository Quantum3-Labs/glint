# Glint — APAC Stellar Hackathon Submission

Everything submitted on RiseIn (Idea Submission survey + Project Submission), collected as source material for the presentation.

**Links**

- Demo video: https://www.loom.com/share/ec0b4368e9014ffdb0f8c0050675c00d
- GitHub repo: https://github.com/Quantum3-Labs/glint
- Track: Payment & Consumer Applications
- Country: Vietnam
- Live on Stellar testnet. Contract IDs are in the repo README (privacy pool, UltraHonk verifier, USDC SAC, relayer address).

---

## Idea Submission (survey answers)

### Q1. Project Name

Glint. Private USDC tipping and patronage for creators on Stellar.

### Q2. Problem Statement

Creator support today is broken in two ways. Platforms like Patreon and Ko-fi take 5 to 12% in fees and control payouts, which hits hardest in APAC where margins are thin and payout rails are slow. The obvious fix, direct crypto tips, creates a new problem: everything is public. A supporter who tips a creator onchain permanently exposes their wallet, balance, tip amounts, and entire support history to everyone, including employers, governments, and bad actors. This chills support for sensitive or independent creators such as journalists, activists, and political commentators. There is currently no way on Stellar to financially support a creator both verifiably and privately.

### Q3. Proposed Solution

Glint is a micropayment tipping dApp on Stellar with two support paths. (1) Public tipping: zero fee USDC tips with a note on the creator's public wall, paid over the x402 protocol, so both humans in a browser and AI agents over plain HTTP can tip. (2) Private Patronage, the headline feature: a Tornado style ZK privacy pool built on Soroban. A supporter makes one fixed amount USDC deposit ($0.1, $1, $5, $10, or $100 tiers) into a shared pool, then later takes anonymous, onchain verifiable actions: pay the creator privately, post a verified "$X supporter" message, or cast a stake weighted poll vote. None of these actions can be linked back to their wallet. Proofs are Noir/UltraHonk zero knowledge proofs generated entirely in the browser and verified onchain by a Soroban verifier contract, and a relayer submits the action transaction so the supporter's wallet never signs it. Supporters get privacy. Creators get provable, onchain support with zero platform fees.

### Q4. Target Users / Audience

Primary: independent creators in APAC, including indie developers, artists, writers, streamers, and open source maintainers, who want direct USDC income without platform fees or payout delays. Also their supporters, especially those who value financial privacy or support sensitive creators such as journalists, activists, and commentators, and do not want their support history exposed onchain. Secondary: AI agents and automated services that tip or pay creators programmatically over HTTP via x402, with no browser or wallet UI required.

### Q5. Team Member Names & Roles

Gian Alarcon, Founder and CEO: product, full stack development, Stellar and Soroban integration. Rust systems engineer, migrated a ZK proof system from C/C++ to Rust, maintains widely used ZK dev tooling (scaffold-stark), won the Starknet track at ETHOxford 2024. Huy, CTO: ZK circuits (Noir), smart contracts, product architecture, and the relayer design.

### Q6. Country

Vietnam

### Q7. Expected Stellar Integration

Deep Soroban and Stellar rails integration. (1) Two Soroban smart contracts in Rust: a public tip wall contract, and a privacy pool contract that custodies USDC, maintains per tier Poseidon Merkle trees, tracks nullifiers, and verifies UltraHonk ZK proofs fully onchain via a verifier contract using Protocol 25/26 BN254 host functions (soroban-sdk 26). (2) USDC via the Stellar Asset Contract (SAC) for deposits, tips, and private payouts. (3) x402 payments on Stellar (stellar:testnet) so tips work over plain HTTP for humans and AI agents. (4) Freighter wallet for the single user signed deposit, while all private actions are relayed by a server keypair so they never touch the supporter's wallet. (5) Horizon and Soroban RPC for chain access, with every action deep linked to its onchain transaction. Currently live on testnet end to end: deposit, then in browser Noir proof, then onchain verification, then relayed action.

### Q8. Hackathon Track

Payment & Consumer Applications

---

## Project Submission (Project Description, 2,805 chars)

Glint is a privacy first tipping and patronage dApp on Stellar. Creators receive USDC directly with zero platform fees, and supporters can back them either publicly or completely anonymously.

There are two support paths.

1. Public tipping. A supporter (or an AI agent over plain HTTP, via the x402 payment protocol) sends a USDC tip with a note that appears on the creator's public wall. The server records each tip onchain through a Soroban tip wall contract after x402 settlement.

2. Private Patronage, the headline feature. It is a Tornado style zero knowledge privacy pool built on Soroban. A supporter makes one fixed amount USDC deposit ($0.1, $1, $5, $10, or $100 tiers) into a shared pool. That deposit is the only wallet signed step. Later, without connecting a wallet at all, the supporter can take anonymous but onchain verifiable actions: privately pay the creator, post a verified supporter message on the creator's wall, or cast a stake weighted vote in the creator's poll. Each action proves membership in the pool's Merkle tree with a Noir/UltraHonk zero knowledge proof generated entirely in the browser, reveals a single use domain separated nullifier to prevent double spending, and is submitted by a relayer so nothing links the action to the depositor's wallet.

How it works technically. The privacy pool contract (Rust, soroban-sdk 26) custodies USDC, maintains one Poseidon Merkle tree per tier with a 30 root history, tracks nullifiers, and verifies proofs fully onchain through an UltraHonk verifier contract using Stellar's Protocol 25/26 BN254 host functions. One unified Noir circuit with 7 public inputs (root, nullifier hash, creator, tier, domain, sub id, action data) serves all three action types, and recipient binding via keccak256(recipient) prevents proof front running. The frontend is Next.js with Freighter for the deposit, and USDC moves through the Stellar Asset Contract.

Everything is live on Stellar testnet end to end: deposit, in browser proof generation, onchain verification, and relayed actions, plus the public x402 tipping flow. Deployed contract addresses (privacy pool, UltraHonk verifier, tip wall) are listed in the README of the GitHub repository, together with setup instructions and scripts reviewers can run, including a full end to end script that performs a deposit, generates a proof, and posts an anonymous supporter message on testnet.

Why it matters. Platforms take 5 to 12% from creators and control payouts, while raw crypto tips expose the supporter's entire financial history onchain. Glint gives creators fee free USDC income on Stellar and gives supporters real financial privacy, with every claim verifiable onchain.

Team: Gian Alarcon (Founder and CEO, product and full stack) and Huy (CTO, ZK circuits and smart contracts).

---

## Suggested PPT outline

1. **Title** — Glint: private USDC tipping and patronage on Stellar. Team, track, one line pitch.
2. **Problem** — platform fees (5 to 12%) and payout friction in APAC; public onchain tips expose supporters. Quote Q2.
3. **Solution** — the two paths side by side: public x402 tipping vs Private Patronage. Quote Q3.
4. **How privacy works** — diagram: deposit commitment → Merkle tree → in browser Noir/UltraHonk proof → nullifier → relayer submits. One slide, no math.
5. **Stellar integration** — Soroban contracts, BN254 host functions (Protocol 25/26), USDC SAC, Freighter, x402 on stellar:testnet. Quote Q7 highlights.
6. **Demo** — screenshots or the Loom link; deep link an action to its testnet transaction to show verifiability.
7. **Users and why it matters** — APAC creators, privacy conscious supporters, AI agents. Quote Q4.
8. **Team** — Gian (Founder and CEO) and Huy (CTO), ZK credentials.
9. **Status and next steps** — live end to end on testnet, contract IDs in README; roadmap (mainnet, more tiers, creator onboarding).
