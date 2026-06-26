import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-helpers";
import { bytesToHex, fieldToBytes32 } from "@/lib/patronage/fields";
import { getDepositLeaves } from "@/lib/patronage/server";

/**
 * GET /api/patronage/leaves
 *
 * Returns the pool's leaf commitments (hex, insertion order). The client finds
 * its own leaf index and rebuilds the Merkle path in the browser — so the
 * server never runs bb.js. Leaves are already public on-chain; this leaks nothing.
 */
export async function GET() {
  try {
    const leaves = await getDepositLeaves();
    return NextResponse.json({
      leaves: leaves.map((l) => bytesToHex(fieldToBytes32(l))),
    });
  } catch (err) {
    console.error("[patronage/leaves]", (err as Error).message);
    return serverError("Failed to read pool leaves");
  }
}
