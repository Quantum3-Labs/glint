import { NextResponse } from "next/server";
import { badRequest, serverError } from "@/lib/api-helpers";
import {
  bytesToHex,
  fieldToBytes32,
  isValidTier,
} from "@/lib/patronage/fields";
import { getDepositLeaves } from "@/lib/patronage/server";

/**
 * GET /api/patronage/leaves?tier=<stroops>
 *
 * Returns a tier tree's leaf commitments (hex, insertion order). The client
 * finds its own leaf index and rebuilds the Merkle path in the browser — so the
 * server never runs bb.js. Leaves are already public on-chain; this leaks nothing.
 */
export async function GET(request: Request) {
  const tierParam = new URL(request.url).searchParams.get("tier");
  if (!tierParam || !/^\d+$/.test(tierParam)) {
    return badRequest("tier query param (stroops) is required");
  }
  const tier = BigInt(tierParam);
  if (!isValidTier(tier)) return badRequest("unknown tier");

  try {
    const leaves = await getDepositLeaves(tier);
    return NextResponse.json({
      leaves: leaves.map((l) => bytesToHex(fieldToBytes32(l))),
    });
  } catch (err) {
    console.error("[patronage/leaves]", (err as Error).message);
    return serverError("Failed to read pool leaves");
  }
}
