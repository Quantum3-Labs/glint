# Glint x ZK Hackathon — Feasibility Conclusion

Exploration note only. Every claim below has a verbatim source quote. Items I could
not source are marked **NOT STATED** and excluded from the conclusion.

- Hackathon: [Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk) — deadline **June 29, 2026**.

## Idea

Add **anonymous private patronage** to Glint: a tipper proves "I tipped ≥ $X to this
creator" and posts a **verified anonymous** message on the wall — without revealing which
wallet or payment. Tornado-style: deposit a `commitment` when tipping, later prove
membership + a `nullifier` (anti-reuse) to act anonymously.

## Verdict

**Feasible — only on the Circom + Groth16/BLS12-381 stack.** Noir is not viable on testnet today.

## Evidence (verbatim quotes)

| # | Claim | Source | Exact quote |
|---|---|---|---|
| 1 | Soroban verifies Groth16/BLS12-381 | [Privacy Pools blog](https://stellar.org/blog/ecosystem/prototyping-privacy-pools-on-stellar) | "The ZK scheme is Groth16 using a BLS12-381 curve, supported by Soroban." |
| 2 | Verify cost fits testnet budget | [Privacy Pools blog](https://stellar.org/blog/ecosystem/prototyping-privacy-pools-on-stellar) | "This takes approximately 40 million instructions in a Soroban contract, which is %40 of the maximum instruction budget on testnet." |
| 3 | Commitment + nullifier scheme exists | [Privacy Pools blog](https://stellar.org/blog/ecosystem/prototyping-privacy-pools-on-stellar) | "It computes a hash c=H(s, n) which is called a commitment." |
| 4 | Poseidon hash over BLS12-381 | [Privacy Pools blog](https://stellar.org/blog/ecosystem/prototyping-privacy-pools-on-stellar) | "The tool generates a secret s, nullifier n, and computes the commitment using Poseidon hashing over BLS12-381 field elements." |
| 5 | It is Circom-based, reusable | [Privacy Pools blog](https://stellar.org/blog/ecosystem/prototyping-privacy-pools-on-stellar) | "We adapted the circuits from the 0xbow repository and built them using Circom." |
| 6 | Public reference repo | [Privacy Pools blog](https://stellar.org/blog/ecosystem/prototyping-privacy-pools-on-stellar) | "Privacy Pools Git repository: https://github.com/ymcrcat/soroban-privacy-pools.git" |
| 7 | BLS12-381 is a native Soroban host function | [Protocol 22 blog](https://stellar.org/blog/developers/announcing-protocol-22) | "CAP-0059: host functions for BLS12-381" / "these operations are implemented in the Soroban host environment" |

→ The exact architecture we need (commitment, nullifier, Poseidon, Groth16/BLS, Circom)
already runs on Soroban **testnet** within budget. This is the strongest possible feasibility proof.

## Why NOT Noir (verified)

Noir's native backend is UltraHonk, which needs the **BN254** curve. Soroban has **no native
BN254**, so it must be emulated in WASM. The cost, from a Stellar/Noir dev discussion:

- [noir-lang #8509](https://github.com/orgs/noir-lang/discussions/8509): "total limit is 100M instructions and this is **560M instruction for a single pairing**"
- Same thread, on optimizing it away: "I believe that you can optimize the code but can you reduce it 10x?"

**Arithmetic (mine, not a quote):** 560M for one pairing > the 100M total budget by 5.6×.
A full verification needs more than one pairing. → UltraHonk verification does not fit the
testnet budget. The `indextree` UltraHonk attempt exists ([repo](https://github.com/indextree/ultrahonk_soroban_contract)) but the budget numbers above are why it cannot run on testnet.

The only path that is both Noir **and** BLS (cheap) would be the "Interstellar" backend, but:

- [noir-lang #8654](https://github.com/orgs/noir-lang/discussions/8654): title "Interstellar: Full ZK Pipeline for Noir + Soroban", "Timeline 20 Weeks", "Start Date Jun 6 2025", posted "May 22, 2025". A working public repo / released backend = **NOT STATED**.

→ Proposal stage, no verifiable release. Cannot rely on it for an 11-day build.

**Trade-off accepted:** write the circuit in **Circom**, not Noir. The cryptography (commitment
+ nullifier + Poseidon + Merkle membership) is identical; only the circuit syntax differs.

## Conditions (go / no-go)

1. **Day 1-2 spike (gate):** fork [`soroban-privacy-pools`](https://github.com/ymcrcat/soroban-privacy-pools), deploy the verifier to testnet, confirm one proof verifies within budget. Pass → proceed.
2. **Anonymity needs a crowd.** ZK hides *which* person, not *whether* you acted. A tiny set
   de-anonymizes by elimination. Demo must seed a non-trivial anonymity set.
3. **Unlinkability is the point.** The deposit (tip → commitment) is linkable by the server,
   like Tornado; unlinkability holds only between deposit and the later anonymous action.
   The demo must make that property visible, or the feature is weak.

## Removed from a prior draft (could not source — flagged for honesty)

- "Proofs generated client-side via SnarkJS" — **NOT STATED** in the blog.
- A quote claiming UltraHonk is "blocked for production... only localnet feasible" —
  **NOT STATED** in #8509. Replaced with the raw instruction numbers + explicit arithmetic.

## Sources

- Privacy Pools blog: https://stellar.org/blog/ecosystem/prototyping-privacy-pools-on-stellar
- Privacy Pools repo: https://github.com/ymcrcat/soroban-privacy-pools
- Protocol 22 / CAP-0059 (BLS12-381 host functions): https://stellar.org/blog/developers/announcing-protocol-22
- UltraHonk cost numbers: https://github.com/orgs/noir-lang/discussions/8509
- UltraHonk Soroban repo: https://github.com/indextree/ultrahonk_soroban_contract
- Interstellar proposal: https://github.com/orgs/noir-lang/discussions/8654
- Hackathon: https://dorahacks.io/hackathon/stellar-hacks-zk
