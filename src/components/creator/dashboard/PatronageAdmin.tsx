"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Creator-side control for private patronage: open a poll (store the
 * question/options and open it on-chain) so supporters can vote anonymously.
 * Private payments need no creator setup — the supporter binds the payout
 * address into their proof.
 */
export function PatronageAdmin({
  slug,
  walletAddress,
}: {
  slug: string;
  walletAddress: string;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [creating, setCreating] = useState(false);

  async function createPoll() {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length === 0 || opts.length < 2) {
      toast.error("Add a question and at least 2 options");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/patronage/poll/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          question: question.trim(),
          options: opts,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "failed");
      toast.success("Poll opened — supporters can vote anonymously");
      setQuestion("");
      setOptions(["", ""]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card padding="lg">
      <h3 className="font-display text-xl mb-1">Private patronage</h3>
      <p className="text-xs text-[var(--color-ink-muted)] mb-4">
        Supporters fund you, message, and vote anonymously — no setup needed.
        Open a poll below to collect anonymous votes.
      </p>

      <div className="space-y-3">
        <h4 className="text-sm font-medium">Open a poll</h4>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question (e.g. what should I make next?)"
          maxLength={200}
          className="w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm"
        />
        {options.map((opt, i) => (
          <input
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length option inputs
            key={i}
            value={opt}
            onChange={(e) =>
              setOptions((prev) =>
                prev.map((o, j) => (j === i ? e.target.value : o)),
              )
            }
            placeholder={`Option ${i + 1}`}
            maxLength={60}
            className="w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm"
          />
        ))}
        <div className="flex gap-2">
          {options.length < 4 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOptions((p) => [...p, ""])}
            >
              Add option
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={creating}
            onClick={createPoll}
          >
            {creating ? <Spinner size={14} /> : "Open poll"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
