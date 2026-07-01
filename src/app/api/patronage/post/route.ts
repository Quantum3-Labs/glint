import { NextResponse } from "next/server";
import { badRequest, parseJsonBody, serverError } from "@/lib/api-helpers";
import { validateSlug } from "@/lib/creators";
import { recordActivity } from "@/lib/patronage/activity";
import { hexToBytes, publicInputField } from "@/lib/patronage/fields";
import { submitPost } from "@/lib/patronage/server";
import { clientKeyFromRequest, rateLimit } from "@/lib/rate-limit";

const POST_RATE_LIMIT = { max: 5, windowMs: 60_000 };
const MESSAGE_MAX = 280;

type Body = {
  publicInputsHex?: string;
  proofHex?: string;
  message?: string;
  slug?: string;
};

/**
 * POST /api/patronage/post
 * Body: { publicInputsHex (256 hex), proofHex, message }
 *
 * Relays an anonymous, proof-backed message to the patronage contract. The
 * server pays the fee and submits, so the on-chain tx source does not link to
 * the supporter. Trust comes from the ZK proof + single-use nullifier.
 */
export async function POST(request: Request) {
  const limit = rateLimit(
    `post:${clientKeyFromRequest(request)}`,
    POST_RATE_LIMIT,
  );
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many posts — try again shortly." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await parseJsonBody<Body>(request);
  if (!body) return badRequest("Invalid JSON body");

  const { publicInputsHex, proofHex, message } = body;
  if (
    typeof publicInputsHex !== "string" ||
    !/^[0-9a-fA-F]{448}$/.test(publicInputsHex)
  ) {
    return badRequest("publicInputsHex must be 224 bytes hex");
  }
  if (typeof proofHex !== "string" || !/^[0-9a-fA-F]+$/.test(proofHex)) {
    return badRequest("proofHex must be hex");
  }
  if (typeof message !== "string" || message.length === 0) {
    return badRequest("message is required");
  }
  if (new TextEncoder().encode(message).length > MESSAGE_MAX) {
    return badRequest(`message must be ${MESSAGE_MAX} bytes or less`);
  }
  const slugResult = validateSlug(body.slug ?? "");
  if (!slugResult.ok) return badRequest("valid slug is required");

  try {
    const result = await submitPost(
      hexToBytes(publicInputsHex),
      hexToBytes(proofHex),
      message,
    );
    if (!result.ok) {
      // Proof rejected, nullifier reused, unknown root, or message-hash mismatch.
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 },
      );
    }
    await recordActivity(slugResult.slug, {
      type: "message",
      tier: publicInputField(publicInputsHex, 3).toString(),
      message,
      txHash: result.hash,
      createdAt: Date.now(),
    });
    return NextResponse.json({ ok: true, txHash: result.hash });
  } catch (err) {
    console.error("[patronage/post]", (err as Error).message);
    return serverError("Failed to submit anonymous post");
  }
}
