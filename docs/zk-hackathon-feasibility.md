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

## 4. Instruction budget — MEASURED on testnet (Day-1 spike done)

We ran the spike: forked `rs-soroban-ultrahonk`, generated proofs with the pinned toolchain
(nargo 1.0.0-beta.9 + bb 0.87.0), deployed the verifier to **Stellar testnet (Protocol 27)**, and
verified real proofs on-chain. Numbers from `scripts/measure_ultrahonk_costs` (simulation against
the live testnet RPC):

| Operation | CPU instructions | % of per-tx limit | Min fee | On-chain (testnet) |
|---|---|---|---|---|
| `verify_proof` — `simple_circuit` (1 public input) | 79,964,593 | 79.96% | 0.0137 XLM | succeeded |
| `verify_proof` — `tornado` (Merkle depth 20 + nullifier) | 82,064,455 | 82.06% | 0.0139 XLM | succeeded |
| **full `withdraw`** — verify + Merkle root check + nullifier + event | **83,770,200** | **83.77%** | 0.0173 XLM | **succeeded (real deposit → withdraw)** |

- The live testnet per-tx instruction limit is confirmed **100,000,000**.
- The **complete anonymous-patronage withdraw** (our exact use case) executed end-to-end on
  testnet: a real `deposit` of a commitment, then a real `withdraw` that verified the proof,
  checked the Merkle root, enforced the nullifier, and emitted the event — all in one transaction
  at **83.77M / 100M, ~16M headroom**. Testnet txs:
  [deposit `ba3b86f4…`](https://stellar.expert/explorer/testnet/tx/ba3b86f40467d0c6f2b436b4f51aa89cdb881e06eb13c0efcec57cb0e3c25c28),
  [withdraw `949e1aac…`](https://stellar.expert/explorer/testnet/tx/949e1aac65cb932467dded266c1ee3b6b8cc8c89ca64f275a155058101cf7be9).
- The mixer logic on top of the bare verify costs only ~1.7M instructions (83.77M − 82.06M).
- Fee is trivial (~0.017 XLM per withdraw).

**Key finding — UltraHonk verify cost is a near-constant floor (~80M), not circuit-size-driven.**
The proof is constant size (14,592 bytes) regardless of circuit; verification is dominated by a
fixed MSM + two pairings. `simple_circuit` (smallest) already costs 79.96M; `tornado` (depth 20)
only adds ~2M (mostly the extra public input). So **~80% of the per-tx budget is spent just
verifying one UltraHonk proof**, leaving ~20M for everything else in the transaction.

**Implications:**
- The Day-1 gate **passes end-to-end.** The full `withdraw` (verify + Merkle + nullifier + event)
  runs on testnet at 83.77M / 100M with ~16M headroom; the mixer logic adds only ~1.7M over the
  bare verify.
- **Glint's anonymous action does not move tokens**, so no SAC `transfer` is needed in the proven
  path. The USDC tip already settles at tip time via x402; the ZK step only proves "I tipped
  >= $X" and records an anonymous message (membership + nullifier). So our on-chain cost is the
  measured ~83.77M plus a small delta for storing the message string (<=280 bytes) — comfortably
  inside the ~16M headroom. (To be re-measured once the message field is added.)
- The earlier "shrink the circuit" fallback is **wrong** and removed: shrinking the Merkle depth
  barely moves the verify cost (it is not circuit-size-driven). If the full withdraw ever exceeds
  100M, the real levers are the [SLP-0004](https://github.com/stellar/stellar-protocol/blob/master/limits/slp-0004.md)
  limit raise (100M → 400M, document status "Final" but **NOT VERIFIED** as voted onto live
  networks) or a lighter proof system (Groth16 verify is ~40M per the Privacy Pools prototype).

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

1. **Day-1 spike (gate) — DONE, PASSED end-to-end.** Deployed the verifier + `tornado_classic`
   mixer to testnet and ran a real `deposit` → `withdraw`; the full withdraw fits at 83.77M/100M
   (§4). Glint's variant adds an anonymous message field (no token transfer) — a small delta to
   re-measure against the ~16M headroom once wired.
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
