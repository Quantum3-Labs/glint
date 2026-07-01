import { NextResponse } from "next/server";
import { badRequest, notFound, serverError } from "@/lib/api-helpers";
import { getCreatorsStore, validateSlug } from "@/lib/creators";
import { creatorField } from "@/lib/patronage/fields";
import { getWall } from "@/lib/patronage/server";

/**
 * GET /api/patronage/wall/[slug]
 *
 * Read a creator's wall of anonymous, proof-backed supporter messages.
 * Public read. Each message is verified on-chain (someone who tipped this
 * creator) but unlinkable to a wallet.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const slugResult = validateSlug(slug);
  if (!slugResult.ok) return badRequest(slugResult.error);

  const creator = await getCreatorsStore().get(slugResult.slug);
  if (!creator) return notFound("Creator not found");

  try {
    const messages = await getWall(creatorField(slugResult.slug));
    return NextResponse.json({
      messages: messages.map((m) => ({
        message: m.message,
        tier: m.tier.toString(),
        timestamp: m.timestamp.toString(),
      })),
    });
  } catch (err) {
    console.error(
      `[patronage/wall/${slugResult.slug}]`,
      (err as Error).message,
    );
    return serverError("Failed to fetch anonymous wall");
  }
}
