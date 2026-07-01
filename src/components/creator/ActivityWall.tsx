"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeTime } from "@/lib/format-time";
import {
  PATRONAGE_ACTIVITY_EVENT,
  PATRONAGE_POSTED_EVENT,
  type PatronagePostedDetail,
} from "@/lib/patronage/events";
import { stellarExpertTxUrl } from "@/lib/stellar";

type ActivityItem = {
  type: "payment" | "message" | "vote";
  tier: string;
  message?: string;
  pollId?: number;
  choice?: number;
  txHash: string;
  createdAt: number;
};

const LABELS: Record<ActivityItem["type"], string> = {
  payment: "Private payment",
  message: "Message",
  vote: "Vote",
};

function dollars(stroops: string): string {
  return `$${Number(BigInt(stroops)) / 1e7}`;
}

/**
 * Public feed of anonymous, ZK-verified actions on a creator: private payments,
 * messages, and votes. Every item links to its on-chain tx — open it and the
 * source is the relayer, never the supporter's wallet (unlinkable). Refetches
 * when a new action is relayed.
 */
export function ActivityWall({ slug }: { slug: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/patronage/activity/${encodeURIComponent(slug)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items: ActivityItem[] };
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
    function onEvent(e: Event) {
      if ((e as CustomEvent<PatronagePostedDetail>).detail?.slug === slug) {
        load();
      }
    }
    window.addEventListener(PATRONAGE_ACTIVITY_EVENT, onEvent);
    window.addEventListener(PATRONAGE_POSTED_EVENT, onEvent);
    return () => {
      window.removeEventListener(PATRONAGE_ACTIVITY_EVENT, onEvent);
      window.removeEventListener(PATRONAGE_POSTED_EVENT, onEvent);
    };
  }, [slug, load]);

  return (
    <Card className="flex h-full min-h-[22rem] flex-col">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="font-display text-2xl">Activity</h2>
        <span className="text-xs text-[var(--color-ink-muted)]">
          ZK-verified · unlinkable
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden pr-1">
          {loading ? (
            <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Private payments, messages, and votes appear here — each verifiable on-chain, none linkable to a wallet."
              className="border-none p-0 bg-transparent"
            />
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.txHash}
                  className="pb-4 border-b border-[var(--color-border)] last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)] mb-1">
                    <span className="rounded-full bg-[var(--color-surface-sunken)] px-2 py-0.5 font-medium text-[var(--color-ink-soft)]">
                      {LABELS[item.type]}
                    </span>
                    <span>{dollars(item.tier)} supporter</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {formatRelativeTime(
                        String(Math.floor(item.createdAt / 1000)),
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <a
                      href={stellarExpertTxUrl(item.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline"
                    >
                      View tx
                    </a>
                  </div>

                  {item.type === "payment" && (
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      Paid {dollars(item.tier)} to the creator, privately.
                    </p>
                  )}
                  {item.type === "message" && (
                    <p className="pl-3 border-l-2 border-[var(--color-accent)] text-sm text-[var(--color-ink-soft)] whitespace-pre-wrap break-words">
                      {item.message}
                    </p>
                  )}
                  {item.type === "vote" && (
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      Voted anonymously on poll #{item.pollId}.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
