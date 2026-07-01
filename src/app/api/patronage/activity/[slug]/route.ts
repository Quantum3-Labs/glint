import { NextResponse } from "next/server";
import { badRequest, serverError } from "@/lib/api-helpers";
import { validateSlug } from "@/lib/creators";
import { getActivityStore } from "@/lib/patronage/activity";

/**
 * GET /api/patronage/activity/[slug]
 *
 * Public anonymous-activity feed for a creator: private payments, messages, and
 * votes, newest first, each with its on-chain tx hash. Every item is verifiable
 * on-chain and unlinkable to a wallet.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const slugResult = validateSlug(slug);
  if (!slugResult.ok) return badRequest(slugResult.error);

  try {
    const items = await getActivityStore().list(slugResult.slug);
    return NextResponse.json({ items });
  } catch (err) {
    console.error(
      `[patronage/activity/${slugResult.slug}]`,
      (err as Error).message,
    );
    return serverError("Failed to fetch activity");
  }
}
