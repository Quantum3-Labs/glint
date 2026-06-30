import type { HTTPRequestContext } from "@x402/core/server";
import { badRequest, notFound, parseJsonBody } from "@/lib/api-helpers";
import { getCreatorsStore, validateSlug } from "@/lib/creators";
import { NextHTTPAdapter } from "@/lib/next-http-adapter";
import { clientKeyFromRequest, rateLimit } from "@/lib/rate-limit";
import { isValidStellarAddress, usdcToStroops } from "@/lib/stellar";
import { DEFAULT_TIP_AMOUNT, TIP_MESSAGE_MAX } from "@/lib/tip-limits";
import { recordTipMessage } from "@/lib/tipjar";
import { getX402HttpServer } from "@/lib/x402-server";

/**
 * Abuse guard — per-IP sliding window. Cheap notes cost ~$0.01 but could
 * still spam the tipping wall. Cloud Run has multiple instances so this is
 * best-effort; move to a shared store (Firestore / Redis) if traffic grows.
 */
const TIP_RATE_LIMIT = { max: 5, windowMs: 60_000 };

type TipBody = {
  message?: string;
  from?: string;
  amount?: string;
};

/**
 * POST /api/tip/[slug]
 *
 * x402-protected tip endpoint for a specific creator.
 *
 * Flow:
 *   1. Client sends POST with optional JSON body: { message?, from?, amount? }
 *   2. Without X-PAYMENT → server returns 402 with payment requirements
 *      (price from query `amount`, payTo from creator DB)
 *   3. Client signs payment via Freighter, retries with X-PAYMENT header
 *   4. Facilitator verifies + settles USDC on-chain
 *   5. Server (optionally) records message on TipJar contract — non-blocking
 *   6. Server returns 200 with tip confirmation
 *
 * Message recording:
 *   - Only runs if client sent a `message` AND `from` in the body
 *   - Retries up to 3 times via tipjar client
 *   - If it still fails, we return 200 + `messageRecorded: false`
 *     (USDC transfer already succeeded — we don't want to hide that)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const slugResult = validateSlug(slug);
  if (!slugResult.ok) return badRequest(slugResult.error);

  const rateKey = `tip:${clientKeyFromRequest(request)}:${slugResult.slug}`;
  const limit = rateLimit(rateKey, TIP_RATE_LIMIT);
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many tips — try again shortly.",
        retryAfterSec: limit.retryAfterSec,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(limit.retryAfterSec),
        },
      },
    );
  }

  const creator = await getCreatorsStore().get(slugResult.slug);
  if (!creator) return notFound("Creator not found");

  // Parse optional body. Missing body is fine — tip proceeds without message.
  const body = (await parseJsonBody<TipBody>(request)) ?? {};

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length > TIP_MESSAGE_MAX) {
    return badRequest(`Message must be ${TIP_MESSAGE_MAX} characters or less`);
  }

  // Validate optional from (tipper address)
  const from = isValidStellarAddress(body.from) ? body.from : undefined;

  const server = await getX402HttpServer();

  const adapter = new NextHTTPAdapter(request);
  const context: HTTPRequestContext = {
    adapter,
    path: adapter.getPath(),
    method: adapter.getMethod(),
    paymentHeader: adapter.getHeader("x-payment"),
  };

  const result = await server.processHTTPRequest(context);

  if (result.type === "payment-error") {
    return new Response(JSON.stringify(result.response.body), {
      status: result.response.status,
      headers: result.response.headers,
    });
  }

  if (result.type === "no-payment-required") {
    return Response.json({ ok: true, paid: false });
  }

  // result.type === "payment-verified"
  // Settle payment on-chain via facilitator
  const settleResult = await server.processSettlement(
    result.paymentPayload,
    result.paymentRequirements,
    result.declaredExtensions,
  );

  if (!settleResult.success) {
    return new Response(JSON.stringify(settleResult.response.body), {
      status: settleResult.response.status,
      headers: settleResult.response.headers,
    });
  }

  // Record the tip on-chain via TipJar — ALWAYS, even if no message.
  // This makes TipJar the single source of truth for tip history (since
  // Horizon's /payments doesn't list Soroban SAC transfers).
  //
  // Non-blocking: if contract call fails after retries, we return 200
  // because USDC transfer already settled via x402. The tip shows as paid
  // but won't appear on the wall until the server recovers.
  let recordedOnChain: boolean | null = null;
  let recordError: string | null = null;
  const settlementTxHash = settleResult.transaction;

  if (from) {
    // amount comes from query param `amount`; convert decimal USDC → stroops
    const amountRaw = adapter.getQueryParam?.("amount");
    const amountStr =
      typeof amountRaw === "string" ? amountRaw : DEFAULT_TIP_AMOUNT;
    const amountStroops = usdcToStroops(amountStr);

    const record = await recordTipMessage(
      from,
      creator.walletAddress,
      amountStroops,
      message, // empty string is fine — means "tip without a message"
      settlementTxHash,
    );

    if (record.ok) {
      recordedOnChain = true;
    } else {
      recordedOnChain = false;
      recordError = record.error;
      console.error(`[tip/${creator.slug}] record_tip failed: ${record.error}`);
    }
  }

  const responseBody = {
    ok: true,
    slug: creator.slug,
    recipient: creator.walletAddress,
    paidAt: new Date().toISOString(),
    recordedOnChain,
    txHash: settlementTxHash,
    ...(recordError ? { recordError } : {}),
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...settleResult.headers,
    },
  });
}
