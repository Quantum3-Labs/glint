import { notFound } from "next/navigation";
import { OwnerPollButton } from "@/components/creator/OwnerPollButton";
import { ProfileTabs } from "@/components/creator/ProfileTabs";
import { ShareButton } from "@/components/creator/ShareButton";
import { SocialLinks } from "@/components/creator/SocialLinks";
import { PageShell } from "@/components/layout/PageShell";
import { InitialAvatar } from "@/components/ui/InitialAvatar";
import { getCreatorsStore, validateSlug } from "@/lib/creators";
import { shortenAddress } from "@/lib/stellar";

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const slugResult = validateSlug(slug);
  if (!slugResult.ok) notFound();

  const creator = await getCreatorsStore().get(slugResult.slug);
  if (!creator) notFound();

  return (
    <PageShell maxWidth="6xl">
      {/* Profile header */}
      <section className="mb-10">
        <div className="flex items-start gap-6 flex-wrap">
          <InitialAvatar name={creator.displayName} size="xl" />
          <div className="flex-1 min-w-0 space-y-2">
            <h1 className="font-display text-5xl leading-none">
              {creator.displayName}
            </h1>
            <div className="text-sm text-[var(--color-ink-muted)] flex items-center gap-2 flex-wrap">
              <span className="font-mono">@{creator.slug}</span>
              <span>·</span>
              <span>
                Joined{" "}
                {new Date(creator.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                })}
              </span>
              <span>·</span>
              <span className="font-mono">
                {shortenAddress(creator.walletAddress, 4, 4)}
              </span>
            </div>
            {creator.bio && (
              <p className="text-[var(--color-ink-soft)] max-w-xl pt-2 whitespace-pre-wrap">
                {creator.bio}
              </p>
            )}
            <SocialLinks creator={creator} />
          </div>
          <div className="flex items-center gap-2">
            <OwnerPollButton
              slug={creator.slug}
              creatorWallet={creator.walletAddress}
            />
            <ShareButton slug={creator.slug} />
          </div>
        </div>
      </section>

      {/* Two ways to support: public tip vs private patronage (tabs) */}
      <ProfileTabs
        slug={creator.slug}
        displayName={creator.displayName}
        creatorWallet={creator.walletAddress}
      />
    </PageShell>
  );
}
