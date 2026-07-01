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
import { createPoll, getTally } from "@/lib/patronage/server";
import { getPollStore } from "@/lib/polls";

/**
 * GET /api/patronage/poll/[slug]
 * Public: poll metadata (question + options) joined with on-chain vote tallies.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const slugResult = validateSlug(slug);
  if (!slugResult.ok) return badRequest(slugResult.error);

  try {
    const polls = await getPollStore().list(slugResult.slug);
    const creator = creatorField(slugResult.slug);
    const withTallies = await Promise.all(
      polls.map(async (p) => ({
        ...p,
        tallies: await getTally(creator, p.id),
      })),
    );
    return NextResponse.json({ polls: withTallies });
  } catch (err) {
    console.error(
      `[patronage/poll/${slugResult.slug}]`,
      (err as Error).message,
    );
    return serverError("Failed to fetch polls");
  }
}

type CreateBody = {
  walletAddress?: string;
  question?: string;
  options?: string[];
};

/**
 * POST /api/patronage/poll/[slug]
 * Owner-only (walletAddress must match the profile). Stores the poll metadata
 * and opens it on-chain so supporters can vote.
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

  const body = await parseJsonBody<CreateBody>(request);
  if (!body) return badRequest("Invalid JSON body");
  if (body.walletAddress !== creator.walletAddress) {
    return forbidden("Only the creator can open a poll");
  }

  const question = body.question?.trim();
  if (!question || question.length > 200) {
    return badRequest("question is required (<= 200 chars)");
  }
  const options = body.options?.map((o) => o.trim()).filter(Boolean) ?? [];
  if (options.length < 2 || options.length > 4) {
    return badRequest("a poll needs 2 to 4 options");
  }

  try {
    const poll = await getPollStore().add(slugResult.slug, {
      question,
      options,
    });
    const onChain = await createPoll(
      creatorField(slugResult.slug),
      poll.id,
      options.length,
    );
    if (!onChain.ok) {
      return NextResponse.json(
        { ok: false, error: onChain.error },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, poll });
  } catch (err) {
    console.error(
      `[patronage/poll/${slugResult.slug}]`,
      (err as Error).message,
    );
    return serverError("Failed to create poll");
  }
}
