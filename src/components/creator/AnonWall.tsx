"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

type AnonMessage = { message: string; timestamp: string };

/**
 * Wall of anonymous, proof-backed supporter messages for a creator.
 * Each message was verified on-chain (a real supporter) but is unlinkable to
 * any wallet.
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
  }, [load]);

  return (
    <Card padding="lg">
      <div className="flex items-baseline justify-between mb-4">
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
        <ul className="space-y-3">
          {messages
            .slice()
            .reverse()
            .map((m, i) => (
              <li
                key={`${m.timestamp}-${i}`}
                className="p-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)]"
              >
                <p className="text-sm text-[var(--color-ink)] whitespace-pre-wrap break-words">
                  {m.message}
                </p>
                <p className="text-xs text-[var(--color-ink-muted)] mt-1">
                  verified supporter ·{" "}
                  {new Date(Number(m.timestamp) * 1000).toLocaleString()}
                </p>
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
