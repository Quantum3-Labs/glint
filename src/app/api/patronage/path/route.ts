import { NextResponse } from "next/server";
import { badRequest, parseJsonBody, serverError } from "@/lib/api-helpers";
import { bytes32ToField, hexToBytes } from "@/lib/patronage/fields";
import { buildMerklePath, getDepositLeaves } from "@/lib/patronage/server";

/**
 * POST /api/patronage/path
 * Body: { commitmentHex }
 *
 * Returns the Merkle membership path (siblings + direction bits + root) for the
 * supporter's commitment, so they can build a post proof. The commitment is
 * already public on-chain (it was deposited), so this leaks nothing.
 */
export async function POST(request: Request) {
  const body = await parseJsonBody<{ commitmentHex?: string }>(request);
  const commitmentHex = body?.commitmentHex;
  if (
    typeof commitmentHex !== "string" ||
    !/^[0-9a-fA-F]{64}$/.test(commitmentHex)
  ) {
    return badRequest("commitmentHex must be 32 bytes hex");
  }

  try {
    const target = bytes32ToField(hexToBytes(commitmentHex));
    const leaves = await getDepositLeaves();
    const leafIndex = leaves.indexOf(target);
    if (leafIndex < 0) {
      return badRequest(
        "commitment not found in pool (deposit not settled yet?)",
      );
    }
    const { siblings, bits, root } = await buildMerklePath(leaves, leafIndex);
    return NextResponse.json({
      leafIndex,
      // decimal field strings: consumed directly by Noir inputs + BigInt()
      siblings: siblings.map((s) => s.toString()),
      bits,
      root: root.toString(),
    });
  } catch (err) {
    console.error("[patronage/path]", (err as Error).message);
    return serverError("Failed to build Merkle path");
  }
}
