import { NextResponse } from "next/server";
import { badRequest, parseJsonBody, serverError } from "@/lib/api-helpers";
import { validateSlug } from "@/lib/creators";
import { recordActivity } from "@/lib/patronage/activity";
import { hexToBytes, publicInputField } from "@/lib/patronage/fields";
import { submitWithdraw } from "@/lib/patronage/server";
import { clientKeyFromRequest, rateLimit } from "@/lib/rate-limit";
import { isValidStellarAddress } from "@/lib/stellar";

const RATE_LIMIT = { max: 5, windowMs: 60_000 };

type Body = {
  publicInputsHex?: string;
  proofHex?: string;
  recipient?: string;
  slug?: string;
};

/**
 * POST /api/patronage/withdraw
 * Body: { publicInputsHex (448 hex), proofHex }
 *
 * Relays a private withdrawal: the contract verifies the proof and pays the
 * registered creator wallet the tier amount. The server pays the fee and
 * submits, so the on-chain tx source does not link to the depositor.
 */
export async function POST(request: Request) {
  const limit = rateLimit(
    `withdraw:${clientKeyFromRequest(request)}`,
    RATE_LIMIT,
  );
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many withdrawals — try again shortly." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await parseJsonBody<Body>(request);
  if (!body) return badRequest("Invalid JSON body");

  const { publicInputsHex, proofHex, recipient } = body;
  if (
    typeof publicInputsHex !== "string" ||
    !/^[0-9a-fA-F]{448}$/.test(publicInputsHex)
  ) {
    return badRequest("publicInputsHex must be 224 bytes hex");
  }
  if (typeof proofHex !== "string" || !/^[0-9a-fA-F]+$/.test(proofHex)) {
    return badRequest("proofHex must be hex");
  }
  if (!isValidStellarAddress(recipient)) {
    return badRequest("recipient must be a valid Stellar address");
  }
  const slugResult = validateSlug(body.slug ?? "");
  if (!slugResult.ok) return badRequest("valid slug is required");

  try {
    const result = await submitWithdraw(
      hexToBytes(publicInputsHex),
      hexToBytes(proofHex),
      recipient,
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 },
      );
    }
    await recordActivity(slugResult.slug, {
      type: "payment",
      tier: publicInputField(publicInputsHex, 3).toString(),
      txHash: result.hash,
      createdAt: Date.now(),
    });
    return NextResponse.json({ ok: true, txHash: result.hash });
  } catch (err) {
    console.error("[patronage/withdraw]", (err as Error).message);
    return serverError("Failed to submit withdrawal");
  }
}
