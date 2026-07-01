"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import {
  PATRONAGE_ACTIVITY_EVENT,
  PATRONAGE_POLL_CREATED_EVENT,
  type PatronagePostedDetail,
} from "@/lib/patronage/events";
import { DOMAIN } from "@/lib/patronage/fields";
import { nullifierHash } from "@/lib/patronage/poseidon";
import type { NoteState, StoredNote } from "@/lib/patronage/use-patronage";

type Poll = {
  id: number;
  question: string;
  options: string[];
  tallies: number[];
};

/**
 * Anonymous, stake-weighted voting for a creator's polls. Each deposit note can
 * vote once per poll (its tier as weight); a supporter with several notes can
 * apply each. The tally is read live from the contract and the voter is
 * unlinkable to their wallet (the proof is relayed).
 *
 * Display + voting only — poll creation is an owner action in the profile header
 * (`OwnerPollButton`). Refetches on poll-created and activity events.
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
  // `${commitmentHex}:${pollId}` for notes that already voted that poll.
  const [voted, setVoted] = useState<Set<string>>(new Set());
  // The (pollId, choice) currently being cast, for a per-button spinner.
  const [voting, setVoting] = useState<string | null>(null);

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

  // Work out which notes have already voted which polls (per-poll nullifier).
  const refreshVoted = useCallback(
    async (pollList: Poll[]) => {
      if (notes.length === 0 || pollList.length === 0) {
        setVoted(new Set());
        return;
      }
      const entries: { key: string; nf: string }[] = [];
      for (const n of notes) {
        for (const p of pollList) {
          const nf = await nullifierHash(
            BigInt(n.nullifier),
            DOMAIN.VOTE,
            BigInt(p.id),
          );
          entries.push({
            key: `${n.commitmentHex}:${p.id}`,
            nf: nf.toString(),
          });
        }
      }
      try {
        const res = await fetch("/api/patronage/spent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nullifierHashes: entries.map((e) => e.nf) }),
        });
        if (res.ok) {
          const { spent } = (await res.json()) as { spent: string[] };
          const spentSet = new Set(spent);
          setVoted(
            new Set(
              entries.filter((e) => spentSet.has(e.nf)).map((e) => e.key),
            ),
          );
        }
      } catch {
        // ignore — worst case a vote is attempted and the contract rejects it
      }
    },
    [notes],
  );

  useEffect(() => {
    load();
    function onEvent(e: Event) {
      if ((e as CustomEvent<PatronagePostedDetail>).detail?.slug === slug) {
        load();
      }
    }
    window.addEventListener(PATRONAGE_POLL_CREATED_EVENT, onEvent);
    window.addEventListener(PATRONAGE_ACTIVITY_EVENT, onEvent);
    return () => {
      window.removeEventListener(PATRONAGE_POLL_CREATED_EVENT, onEvent);
      window.removeEventListener(PATRONAGE_ACTIVITY_EVENT, onEvent);
    };
  }, [slug, load]);

  // Recompute per-note vote status whenever polls or notes change.
  useEffect(() => {
    refreshVoted(polls);
  }, [polls, refreshVoted]);

  // Hidden until at least one poll exists (stays mounted to catch events).
  if (loaded && polls.length === 0) return null;

  /** First note that hasn't voted this poll yet, or undefined. */
  function noteFor(pollId: number): StoredNote | undefined {
    return notes.find((n) => !voted.has(`${n.commitmentHex}:${pollId}`));
  }

  async function handleVote(pollId: number, choice: number) {
    const note = noteFor(pollId);
    if (!note) return;
    setVoting(`${pollId}:${choice}`);
    const ok = await onVote(note, pollId, choice);
    setVoting(null);
    if (ok) {
      await load();
      await refreshVoted(polls);
    }
  }

  return (
    <Card padding="lg">
      <h2 className="font-display text-2xl mb-1">Polls</h2>
      <p className="text-xs text-[var(--color-ink-muted)] mb-5">
        Anonymous · stake-weighted (vote = your deposit) · ZK-verified
      </p>

      <div className="space-y-6">
        {polls.map((poll) => {
          const total = poll.tallies.reduce((a, b) => a + b, 0);
          const canVote = !!noteFor(poll.id);
          return (
            <div
              key={poll.id}
              className="space-y-3 pb-6 border-b border-[var(--color-border)] last:border-b-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-medium">{poll.question}</h3>
                {notes.length > 0 && !canVote && (
                  <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
                    You've voted
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {poll.options.map((opt, i) => {
                  const weight = poll.tallies[i] ?? 0;
                  const pct =
                    total > 0 ? Math.round((weight / total) * 100) : 0;
                  const isVoting = voting === `${poll.id}:${i}`;
                  return (
                    <li
                      key={`${poll.id}-${i}`}
                      className="flex items-center gap-3"
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!!busy || !canVote}
                        onClick={() => handleVote(poll.id, i)}
                      >
                        {isVoting ? <Spinner size={14} /> : "Vote"}
                      </Button>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>{opt}</span>
                          <span className="text-[var(--color-ink-muted)] font-mono">
                            ${weight / 1e7} · {pct}%
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

      {notes.length === 0 && (
        <p className="text-xs text-[var(--color-ink-muted)] mt-4">
          Deposit into the pool to vote anonymously.
        </p>
      )}
    </Card>
  );
}
