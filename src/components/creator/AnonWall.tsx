"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeTime } from "@/lib/format-time";
import {
  PATRONAGE_POSTED_EVENT,
  type PatronagePostedDetail,
} from "@/lib/patronage/events";

type AnonMessage = { message: string; timestamp: string };

/**
 * Wall of anonymous, proof-backed supporter messages for a creator.
 * Each message was verified on-chain (a real supporter) but is unlinkable to
 * any wallet. Refetches when a new anonymous message is posted.
 */
export function AnonWall({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<AnonMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/patronage/wall/${encodeURIComponent(slug)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { messages: AnonMessage[] };
        setMessages(data.messages);
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
    function onPosted(e: Event) {
      if ((e as CustomEvent<PatronagePostedDetail>).detail?.slug === slug) {
        load();
      }
    }
    window.addEventListener(PATRONAGE_POSTED_EVENT, onPosted);
    return () => window.removeEventListener(PATRONAGE_POSTED_EVENT, onPosted);
  }, [slug, load]);

  return (
    <Card padding="lg" className="flex h-full min-h-[22rem] flex-col">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="font-display text-2xl">Anonymous wall</h2>
        <span className="text-xs text-[var(--color-ink-muted)]">
          ZK-verified · unlinkable
        </span>
      </div>

      {/* relative+absolute: the list never drives the card height, so the card
          matches the adjacent box and the list scrolls inside it. */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden pr-1">
          {loading ? (
            <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
          ) : messages.length === 0 ? (
            <EmptyState
              title="No anonymous messages yet"
              description="Supporters who tipped can post a verified message here without revealing their wallet."
              className="border-none p-0 bg-transparent"
            />
          ) : (
            <ul className="space-y-4">
              {messages
                .slice()
                .reverse()
                .map((m, i) => (
                  <li
                    key={`${m.timestamp}-${i}`}
                    className="pb-4 border-b border-[var(--color-border)] last:border-0 last:pb-0"
                  >
                    <div className="text-xs text-[var(--color-ink-muted)] mb-1">
                      verified supporter · {formatRelativeTime(m.timestamp)}
                    </div>
                    <p className="pl-3 border-l-2 border-[var(--color-accent)] text-sm text-[var(--color-ink-soft)] whitespace-pre-wrap break-words">
                      {m.message}
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
