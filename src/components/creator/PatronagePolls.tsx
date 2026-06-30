"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { NoteState, StoredNote } from "@/lib/patronage/use-patronage";

type Poll = {
  id: number;
  question: string;
  options: string[];
  tallies: number[];
};

/**
 * Anonymous voting for a creator's polls. A supporter with a deposit note can
 * cast one vote per poll; the tally is read live from the contract. The voter
 * is unlinkable to their wallet (the proof is relayed by the server).
 */
export function PatronagePolls({
  slug,
  notes,
  busy,
  onVote,
}: {
  slug: string;
  notes: NoteState[];
  busy: string | null;
  onVote: (
    note: StoredNote,
    pollId: number,
    choice: number,
  ) => Promise<boolean>;
}) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/patronage/poll/${encodeURIComponent(slug)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { polls: Poll[] };
        setPolls(data.polls);
      }
    } finally {
      setLoaded(true);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loaded && polls.length === 0) return null;

  // Vote with the first available note (any verified supporter note works).
  const note = notes[0];

  return (
    <Card padding="lg">
      <h2 className="font-display text-2xl mb-1">Polls</h2>
      <p className="text-xs text-[var(--color-ink-muted)] mb-5">
        Anonymous · one vote per supporter · ZK-verified
      </p>

      <div className="space-y-6">
        {polls.map((poll) => {
          const total = poll.tallies.reduce((a, b) => a + b, 0);
          return (
            <div key={poll.id} className="space-y-3">
              <h3 className="text-sm font-medium">{poll.question}</h3>
              <ul className="space-y-2">
                {poll.options.map((opt, i) => {
                  const count = poll.tallies[i] ?? 0;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <li
                      key={`${poll.id}-${i}`}
                      className="flex items-center gap-3"
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!!busy || !note}
                        onClick={() => note && onVote(note, poll.id, i)}
                      >
                        Vote
                      </Button>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>{opt}</span>
                          <span className="text-[var(--color-ink-muted)] font-mono">
                            {count} · {pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--color-accent)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {!note && (
        <p className="text-xs text-[var(--color-ink-muted)] mt-4">
          Deposit into the pool to vote anonymously.
        </p>
      )}
    </Card>
  );
}
