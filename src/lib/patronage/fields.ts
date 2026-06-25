import { keccak_256 } from "@noble/hashes/sha3";

/**
 * Field-element helpers shared by the patronage feature.
 *
 * Everything is a BN254 scalar-field element (the curve the UltraHonk verifier
 * uses). A "field" here is a `bigint` reduced mod `R`, serialized as 32 big-endian
 * bytes when it crosses a contract boundary.
 */

/** BN254 scalar field modulus (r). */
export const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export function modR(x: bigint): bigint {
  const m = x % FIELD_MODULUS;
  return m >= 0n ? m : m + FIELD_MODULUS;
}

/** 32-byte big-endian encoding of a field element (matches BytesN<32> on-chain). */
export function fieldToBytes32(x: bigint): Uint8Array {
  const v = modR(x);
  const out = new Uint8Array(32);
  let t = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(t & 0xffn);
    t >>= 8n;
  }
  return out;
}

export function bytes32ToField(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return modR(v);
}

export function fieldToHex(x: bigint): string {
  return Buffer.from(fieldToBytes32(x)).toString("hex");
}

export function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

/**
 * keccak256(bytes) reduced mod R. This MUST match the contract's
 * `message_hash_field` and `creator` derivation exactly.
 */
export function keccakField(bytes: Uint8Array): bigint {
  return modR(bytes32ToField(keccak_256(bytes)));
}

/**
 * Stable field identifier for a creator, derived from their slug.
 * Used as the public `creator` input and the on-chain wall key.
 */
export function creatorField(slug: string): bigint {
  return keccakField(new TextEncoder().encode(slug));
}

/**
 * Message hash bound into the proof. MUST equal the contract's
 * `keccak256(message) mod r` over the exact same UTF-8 bytes.
 */
export function messageHashField(message: string): bigint {
  return keccakField(new TextEncoder().encode(message));
}
