import { NextResponse } from "next/server";
import { badRequest, parseJsonBody, serverError } from "@/lib/api-helpers";
import { isNullifierUsed } from "@/lib/patronage/server";

/**
 * POST /api/patronage/spent
 * Body: { nullifierHashes: string[] }  (decimal field strings)
 *
 * Returns which of the given nullifier hashes are already spent on-chain, so the
 * client can hide notes that can no longer post.
 */
export async function POST(request: Request) {
  const body = await parseJsonBody<{ nullifierHashes?: string[] }>(request);
  const hashes = body?.nullifierHashes;
  if (!Array.isArray(hashes) || hashes.some((h) => !/^\d+$/.test(h))) {
    return badRequest("nullifierHashes must be an array of decimal strings");
  }
  if (hashes.length > 50) {
    return badRequest("too many nullifier hashes");
  }

  try {
    const results = await Promise.all(
      hashes.map((h) => isNullifierUsed(BigInt(h))),
    );
    const spent = hashes.filter((_, i) => results[i]);
    return NextResponse.json({ spent });
  } catch (err) {
    console.error("[patronage/spent]", (err as Error).message);
    return serverError("Failed to check nullifier status");
  }
}
