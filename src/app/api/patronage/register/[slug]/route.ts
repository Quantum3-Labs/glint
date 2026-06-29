import { NextResponse } from "next/server";
import {
  badRequest,
  forbidden,
  notFound,
  parseJsonBody,
  serverError,
} from "@/lib/api-helpers";
import { getCreatorsStore, validateSlug } from "@/lib/creators";
import { creatorField } from "@/lib/patronage/fields";
import { registerPayout } from "@/lib/patronage/server";

type Body = { walletAddress?: string };

/**
 * POST /api/patronage/register/[slug]
 * Owner-only. Registers the creator's wallet as the on-chain payout address for
 * their creator field, so private withdrawals can pay them. Idempotent.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const slugResult = validateSlug(slug);
  if (!slugResult.ok) return badRequest(slugResult.error);

  const creator = await getCreatorsStore().get(slugResult.slug);
  if (!creator) return notFound("Creator not found");

  const body = await parseJsonBody<Body>(request);
  if (body?.walletAddress !== creator.walletAddress) {
    return forbidden("Only the creator can enable private patronage");
  }

  try {
    const result = await registerPayout(
      creatorField(slugResult.slug),
      creator.walletAddress,
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, txHash: result.hash });
  } catch (err) {
    console.error(
      `[patronage/register/${slugResult.slug}]`,
      (err as Error).message,
    );
    return serverError("Failed to register payout");
  }
}
