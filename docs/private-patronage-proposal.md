# Private Patronage — Proposal

Glint today lets fans tip creators in USDC, and lets them leave an **anonymous
message** that's provably from a real supporter but unlinkable to their wallet.

This proposal extends that single idea into a small **privacy product**: one
private deposit unlocks several anonymous actions. The goal is to give fans real
privacy when they support a creator, while creators still get proof the support
is genuine.

## The core idea

A fan makes one **private deposit** into a shared pool. That deposit gives them a
secret "membership note" that nobody else can see. From that single note, the fan
can later do several things — pay the creator, leave a message, or vote — and
**none of those actions can be traced back to the deposit or to the fan's
wallet**. Each action can only be done once, so nobody can pay twice or vote
twice off one deposit.

Think of it as buying an anonymous token at the door: the door staff see you buy
it, but once you're inside, nobody can tell which token is yours or what you did
with it.

Because each deposit is a known tier, every action also carries a **paid-supporter
badge** ("verified $10 supporter") without revealing who. Note this is a *money
gate*, not a bot filter: it proves real money is behind the action, so messages
and votes can't be spammed for free — but it does not claim the actor is human.

## What fans can do

### 1. Support privately (fixed amounts)

The fan picks a tier — say $5, $10, or $25 — and deposits that amount into the
pool. Amounts are fixed so that deposits look identical and can't be told apart.
Later, the fan privately sends that support to the creator with **no on-chain
link** between the deposit and the payout.

### 2. Leave an anonymous message

The fan posts a message to the creator's wall, tagged with their supporter tier
("verified $10 supporter"), with no wallet and no identity attached. This is the
feature Glint already has — it now sits on top of the same private deposit.

### 3. Vote anonymously

The creator can open a poll (e.g. "what should I make next?"). Supporters vote
anonymously, one vote each. Nobody — not even the creator — can see who voted for
what, but everyone can trust the tally because only real supporters could vote,
and only once.

## What stays private vs. public

| Public (anyone can see) | Private (nobody can link) |
| --- | --- |
| That *someone* deposited a tier amount | *Who* deposited |
| That the creator received support | *Which* deposit paid them |
| Messages and vote totals | *Who* wrote which message / cast which vote |

## Why it matters

- **For fans:** support causes and creators without your wallet history exposing
  your tastes, politics, or spending.
- **For creators:** every message, vote, and payment is provably from a real
  supporter — privacy without losing trust.
- **For the hackathon:** zero-knowledge is doing the real work here. The privacy
  is the product, not a label.

## Scope

Everything builds on the deposit + anonymous-action pattern Glint already ships.
The new pieces are: fixed-amount deposits (tiers), private payout to the creator,
and anonymous voting. The anonymous message feature is reused as-is.

Estimated effort: a few focused days. Each feature is independent and can be
demoed on its own.
