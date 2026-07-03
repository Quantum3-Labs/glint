# Glint TipJar (Soroban)

Records public tip messages for Glint creators. This is the **public** tipping
path; the anonymous ZK path lives in [`contracts/patronage`](../patronage).

## Trust model

The Glint server is the only authorized writer (`admin`). After an x402 USDC
payment settles, the server calls `record_tip` with the tipper address,
recipient, amount, optional note, and the settlement tx hash. The message is
**not** cryptographically authored by the tipper on-chain — authorship is
vouched for by the server. The x402/USDC transfer itself is the authoritative
financial record; the message is social metadata on top.

## Interface

| fn | auth | purpose |
|---|---|---|
| `init(admin)` | — | set the server address allowed to write (once) |
| `admin() -> Address` | none | read the admin address |
| `record_tip(from, to, amount, note, tx_hash)` | admin | append a tip to the recipient's wall |
| `get_tips(to) -> Vec<TipMessage>` | none | a recipient's wall, newest first |
| `tip_count(to) -> u32` | none | number of tips for a recipient |

`TipMessage = { from, amount, note (<=280 bytes), timestamp, tx_hash }`. The
`tx_hash` lets clients deep-link each wall item to Stellar Expert for on-chain
verification of the underlying payment.

## Storage

- `DataKey::Admin` (instance) — the server address allowed to write.
- `DataKey::Tips(recipient)` (persistent) — `Vec<TipMessage>` per creator.

TTL is extended on every `record_tip` (~30 days), so active creators' history
does not expire. Inactive data is eventually archived and can be restored by
paying rent.

## Errors

`AlreadyInitialized(1)`, `NotInitialized(2)`, `MessageTooLong(3)`,
`NegativeAmount(4)`.

## Build & test

```bash
stellar contract build   # -> target/wasm32v1-none/release/tipjar.wasm
cargo test
```
