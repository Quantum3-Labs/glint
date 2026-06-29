import { NextResponse } from "next/server";
import { badRequest, parseJsonBody, serverError } from "@/lib/api-helpers";
import { hexToBytes } from "@/lib/patronage/fields";
import { submitVote } from "@/lib/patronage/server";
import { clientKeyFromRequest, rateLimit } from "@/lib/rate-limit";

const RATE_LIMIT = { max: 10, windowMs: 60_000 };

type Body = { publicInputsHex?: string; proofHex?: string; choice?: number };

/**
 * POST /api/patronage/vote
 * Body: { publicInputsHex (448 hex), proofHex, choice }
 *
 * Relays an anonymous vote: the contract verifies the proof, checks the choice
 * matches the bound `action_data`, and increments the tally. One vote per
 * (deposit, poll) is enforced by the poll-scoped nullifier.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`vote:${clientKeyFromRequest(request)}`, RATE_LIMIT);
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many votes — try again shortly." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await parseJsonBody<Body>(request);
  if (!body) return badRequest("Invalid JSON body");

  const { publicInputsHex, proofHex, choice } = body;
  if (
    typeof publicInputsHex !== "string" ||
    !/^[0-9a-fA-F]{448}$/.test(publicInputsHex)
  ) {
    return badRequest("publicInputsHex must be 224 bytes hex");
  }
  if (typeof proofHex !== "string" || !/^[0-9a-fA-F]+$/.test(proofHex)) {
    return badRequest("proofHex must be hex");
  }
  if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0) {
    return badRequest("choice must be a non-negative integer");
  }

  try {
    const result = await submitVote(
      hexToBytes(publicInputsHex),
      hexToBytes(proofHex),
      choice,
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, txHash: result.hash });
  } catch (err) {
    console.error("[patronage/vote]", (err as Error).message);
    return serverError("Failed to submit vote");
  }
}
