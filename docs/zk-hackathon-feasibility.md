# Glint x Stellar Real-World ZK Hackathon — Proposal (Noir)

Exploration report. Every claim has a source; items I could not source are marked
**NOT VERIFIED** and kept out of the conclusion. Hackathon quotes below are from the official
DoraHacks listing text.

- Hackathon: [Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk) — by the Stellar Development Foundation. Prize pool **$10,000**.
- Submissions open **June 15, 2026 (12:00 AM PST)**; deadline **June 29, 2026 (12:00 PM PST)** = June 30 02:00 UTC.
- Prizes (single open innovation track): 1st **$5,000**, 2nd **$2,000**, 3rd **$1,250**, 4th **$1,000**, 5th **$750** — all in XLM.

## 1. The hackathon — and does Glint qualify?

**Theme (verbatim):** "build anything you want with zero-knowledge on Stellar. Privacy pools,
private payments, confidential tokens, identity and compliance proofs, provable computation,
verifiable data — if it uses ZK and runs on Stellar, it counts."

**Real-world is especially welcome (verbatim):** "Stellar is best known for moving real money in
the real world ... projects that bring ZK to those kinds of real-world use cases are a natural fit
and especially welcome. But that's a suggestion, not a requirement."

**ZK must be load-bearing (verbatim):** "The ZK should be load-bearing: it powers a real part of
how the project works, rather than appearing only on a slide" / "as long as ZK is doing real work
in it (not just namechecked in the README)."

**Our architecture is exactly what they expect (verbatim):** "these primitives are building
blocks ... you generate proofs off-chain with a higher-level system (Noir, Circom, a RISC Zero
zkVM program, etc.) and deploy a verifier contract on Stellar to check them. That gap between
'powerful primitives' and 'finished product' is exactly where the interesting hackathon projects
live."

**Submission requirements (verbatim, all three):**
1. "An open-source repo. A public GitHub, GitLab, or Bitbucket repository with your full source
   code and a clear README.md ... We'd rather see an honest work-in-progress than a polished mystery."
2. "A short demo video. A 2–3 minute walkthrough showing what you built ... You do not have to be in the video."
3. "ZK + Stellar. Your project should use zero-knowledge cryptography in a meaningful way, and it
   should touch Stellar — for example, verifying proofs in a contract ... The ZK should be load-bearing."

   "No mandatory framework, no required boilerplate contract to call, no specific track to fit into."

**Verdict on Glint:**
- Glint today (USDC tipping over x402, public TipJar wall) is **not** a ZK project, so by itself it
  does **not** qualify.
- Glint **plus the anonymous private patronage layer** below qualifies: it is a privacy-pool /
  private-payments project, moving **real money** (USDC tips) — the "especially welcome" category.
  The ZK is load-bearing (without it there is no anonymity), and the build is exactly the
  off-chain-prove + on-chain-verify shape the listing calls "where the interesting projects live."

## 2. The feature: anonymous private patronage

A tipper proves "I tipped >= $X to this creator" and posts a **verified anonymous** message on
the wall — without revealing which wallet or which payment. Privacy-pool / Tornado pattern:
deposit a `commitment` when tipping, later prove Merkle membership + reveal a `nullifier`
(anti-double-use) to act anonymously.

## 3. Stack: Noir + UltraHonk on Soroban — is it good enough? Yes.

The listing names three proven options — RISC Zero, Circom, and Noir. We choose **Noir** (Rust-like,
"Simple to read, understand and work with"). UltraHonk proofs (BN254) verified on a Soroban
contract. Four independent reasons it is a safe choice:

1. **Officially supported by the hackathon** — Noir is one of the three listed options, with a
   verifier repo and an E2E tutorial (evidence #1).
2. **A working verifier already runs on testnet** — `rs-soroban-ultrahonk` (evidence #2).
3. **It uses native BN254 host functions, not WASM emulation** — verified at source level
   (evidence #3). The hackathon itself says Protocol 26 made "proof verification — including
   NoirLang proofs — meaningfully cheaper to run on-chain" (evidence #5).
4. **The exact pattern we need already exists** — a Tornado-style mixer (`tornado_classic`):
   Poseidon2 Merkle tree depth 20, UltraHonk withdraw proof, single-use nullifiers (evidence #4).
   Caveat: it is a token-less educational sample, so we build the deposit/token layer on top.

### Evidence (verbatim quotes)

| # | Claim | Source | Exact quote |
|---|---|---|---|
| 1 | Hackathon officially supports Noir + verifier + tutorial | Hackathon listing (Noir Lang section) | "Noir ... Simple to read, understand and work with. The downside is the Ultrahonk proofs are larger and cost more to verify on-chain." / "Noir Verifier: https://github.com/yugocabrio/rs-soroban-ultrahonk E2E Tutorial: https://jamesbachini.com/noir-on-stellar/" |
| 2 | A Soroban UltraHonk verifier runs on testnet | [rs-soroban-ultrahonk README](https://github.com/NethermindEth/rs-soroban-ultrahonk) | "Soroban contract wrapper around the Noir(UltraHonk) verifier." / "The same flow runs against the Stellar public testnet" |
| 3 | The verifier calls **native** BN254 host functions (not WASM emulation) | [ec.rs source](https://github.com/NethermindEth/rs-soroban-ultrahonk/blob/main/crates/ultrahonk-soroban-verifier/src/ec.rs) | `env.crypto().bn254().g1_msm(vp, vs)` and `env.crypto().bn254().pairing_check(g1s, g2s)` — "Thin shim over the host-native `Bn254::g1_msm`" |
| 4 | A Tornado-style mixer = our exact pattern exists | [tornado_classic README](https://github.com/NethermindEth/rs-soroban-ultrahonk/blob/main/contracts/tornado_classic/README.md) | "Deposit stores commitments and rolls an on-chain Poseidon2 Merkle tree (depth 20). Withdraw verifies a Noir UltraHonk proof against the stored root and enforces single-use nullifiers." / "Educational sample: no token flow" |
| 5 | Protocol 26 made Noir proofs meaningfully cheaper to verify on-chain | Hackathon listing (intro) | "Protocol 26 ('Yardstick') built on that with nine additional BN254 host functions ... making proof verification — including NoirLang proofs — meaningfully cheaper to run on-chain." |
| 6 | Live networks already have the BN254 host functions the verifier needs | [Stellar software-versions docs](https://developers.stellar.org/docs/networks/software-versions) | As of June 2026: **mainnet = Protocol 26** ("Yardstick", live 2026-05-06); **testnet = Protocol 27** (live 2026-06-18). The BN254 EC host functions ship in CAP-0074 (P25) and the G1 MSM host function (`bn254_g1_msm`) in CAP-0080 (P26, status "Implemented"); both are present on the current testnet and mainnet. |

## 4. The one open risk: instruction budget

The hackathon names the trade-off itself: Noir's "downside is the Ultrahonk proofs are larger and
cost more to verify on-chain" (#1). With native host functions this is far cheaper than the old
WASM-emulation numbers — the same listing says P26 made Noir proofs "meaningfully cheaper" (#5) —
but the exact cost for our circuit is the one thing nobody can confirm on paper.

- The per-tx limit (`txMaxInstructions`) is a **validator-voted network config**, not a fixed
  protocol constant; the exact live value must be queried from a node (RPC `getLedgerEntries` on
  the `CONFIG_SETTING_CONTRACT_COMPUTE_V0` entry) — historically ~100M.
  [SLP-0004](https://github.com/stellar/stellar-protocol/blob/master/limits/slp-0004.md) proposes
  raising it 100,000,000 → 400,000,000; its document status is "Final" but that is **not**
  confirmation it has been voted onto the live networks (**NOT VERIFIED** as shipped).

**Why this is manageable, not a blocker:** the cost is directly measurable. The repo ships
[`scripts/measure_ultrahonk_costs`](https://github.com/NethermindEth/rs-soroban-ultrahonk/blob/main/scripts/measure_ultrahonk_costs/README.md),
which "prints CPU instructions, memory usage, and minimum resource fees". Our circuit (Merkle
membership + nullifier) is on the small end. If a Day-1 measurement comes back over budget, the
fallback is to **shrink the circuit** (smaller Merkle depth, fewer public inputs) — not to change
language.

## 5. What changes in Glint (high level)

1. **Deposit on tip.** After the x402 USDC settlement (current `POST /api/tip/[slug]` flow), also
   submit a `commitment` to a new mixer contract (fork of `tornado_classic` + a token layer). The
   tipper keeps the secret + nullifier client-side.
2. **Anonymous post.** Later, the tipper generates an UltraHonk proof in the browser via `bb.js`
   ("tipped >= $X and my commitment is in the tree") and calls a `withdraw`/`post` entrypoint that
   verifies the proof on-chain and records an anonymous wall message keyed by the nullifier.
3. **Wall.** Render anonymous verified messages alongside today's TipJar entries.

The existing TipJar contract stays as the public path; the ZK mixer is the private path.

## 6. Conditions (go / no-go)

1. **Day-1 spike (gate):** fork `rs-soroban-ultrahonk`, deploy the `tornado_classic` verifier +
   mixer to **testnet**, verify one real proof, and run `measure_ultrahonk_costs` on the withdraw
   circuit. Fits the live limit → go. Over budget → shrink the circuit and re-measure.
2. **Anonymity needs a crowd.** ZK hides *which* person, not *whether* you acted. A tiny set
   de-anonymizes by elimination. The demo must seed a non-trivial anonymity set.
3. **Unlinkability is the point.** Deposit (tip -> commitment) is linkable by the server, like
   Tornado; unlinkability holds only between deposit and the later anonymous action. The demo must
   make that property visible, or the feature is weak.
4. **References are unaudited.** `tornado_classic` states it is an educational sample with no token
   flow; we add token custody and review. The README must be honest about mock/unfinished parts —
   which the hackathon explicitly prefers ("an honest work-in-progress over a polished mystery").

## 7. Sources

- Hackathon: https://dorahacks.io/hackathon/stellar-hacks-zk
- Noir Soroban verifier + Tornado mixer: https://github.com/NethermindEth/rs-soroban-ultrahonk (mirror: https://github.com/yugocabrio/rs-soroban-ultrahonk)
- Noir verifier source (native host functions): https://github.com/NethermindEth/rs-soroban-ultrahonk/blob/main/crates/ultrahonk-soroban-verifier/src/ec.rs
- Noir on Stellar E2E tutorial: https://jamesbachini.com/noir-on-stellar/
- Current live protocol version (P26): https://developers.stellar.org/docs/networks/software-versions
- Instruction-limit proposal (SLP-0004): https://github.com/stellar/stellar-protocol/blob/master/limits/slp-0004.md
