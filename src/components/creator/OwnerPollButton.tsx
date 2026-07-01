"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { dispatchPollCreated } from "@/lib/patronage/events";
import { useWalletStore } from "@/stores/wallet";

/**
 * Owner-only "New poll" entry point, shown in the profile header next to Share.
 * Opening a poll is a management action, so it lives here (always visible to the
 * owner) rather than buried inside the supporter-facing "Support privately" tab.
 * On success it broadcasts an event so the Polls list refetches.
 */
export function OwnerPollButton({
  slug,
  creatorWallet,
}: {
  slug: string;
  creatorWallet: string;
}) {
  const address = useWalletStore((s) => s.address);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [creating, setCreating] = useState(false);

  // Only the creator (connected as their own wallet) manages polls.
  if (!address || address !== creatorWallet) return null;

  async function create() {
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
          walletAddress: creatorWallet,
          question: question.trim(),
          options: opts,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "failed");
      toast.success("Poll opened — see it under “Support privately”");
      setQuestion("");
      setOptions(["", ""]);
      setOpen(false);
      dispatchPollCreated(slug);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
      >
        New poll
      </Button>

      {open && (
        <Modal title="Open a poll" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
                Question
              </div>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. what should I make next?"
                maxLength={200}
                className="w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm"
              />
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
                Options
              </div>
              <div className="space-y-2">
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
              </div>
              {options.length < 4 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => setOptions((p) => [...p, ""])}
                >
                  + Add option
                </Button>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--color-border)]">
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={creating}
                onClick={create}
              >
                {creating ? <Spinner size={14} /> : "Open poll"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
