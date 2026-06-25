"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  PATRONAGE_POSTED_EVENT,
  type PatronagePostedDetail,
} from "@/lib/patronage/events";

type AnonMessage = { message: string; timestamp: string };

/** Relative time, matching TipWall's formatting. */
function formatTimestamp(timestamp: string): string {
  const ms = Number(BigInt(timestamp)) * 1000;
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

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
    <Card padding="lg">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="font-display text-2xl">Anonymous wall</h2>
        <span className="text-xs text-[var(--color-ink-muted)]">
          ZK-verified · unlinkable
        </span>
      </div>

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
                  verified supporter · {formatTimestamp(m.timestamp)}
                </div>
                <p className="pl-3 border-l-2 border-[var(--color-accent)] text-sm text-[var(--color-ink-soft)] whitespace-pre-wrap break-words">
                  {m.message}
                </p>
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
