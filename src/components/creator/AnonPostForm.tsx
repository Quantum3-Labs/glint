"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { usePatronagePost } from "@/lib/patronage/use-patronage-post";

const MESSAGE_MAX = 280;

/** Small shield to visually mark this as the private/anonymous path. */
function ShieldIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2 text-[var(--color-accent)]">
      <ShieldIcon />
      <h2 className="font-display text-2xl text-[var(--color-ink)]">
        Post anonymously
      </h2>
    </div>
  );
}

/**
 * Lets a supporter who has a saved deposit note post an anonymous, proof-backed
 * message. All logic (notes, spent-filter, browser proof + relay) lives in
 * `usePatronagePost`; this component is presentational.
 */
export function AnonPostForm({ slug }: { slug: string }) {
  const { notes, selected, setSelected, busy, submit } = usePatronagePost(slug);
  const [message, setMessage] = useState("");

  if (notes.length === 0) {
    return (
      <Card padding="lg" className="border-l-2 border-[var(--color-accent)]">
        <div className="mb-2">
          <Header />
        </div>
        <EmptyState
          title="Tip first to unlock"
          description="After you tip this creator, you get a private note that lets you post a verified anonymous message — without revealing your wallet."
          className="border-none p-0 bg-transparent"
        />
      </Card>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (await submit(message.trim())) setMessage("");
  }

  return (
    <Card padding="lg" className="border-l-2 border-[var(--color-accent)]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Header />
          <p className="text-xs text-[var(--color-ink-muted)] mt-1">
            You tipped — now speak as a verified supporter, without revealing
            which wallet or payment.
          </p>
        </div>

        {notes.length > 1 && (
          <div>
            <label
              htmlFor="note-select"
              className="block text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-2"
            >
              Post from tip ({notes.length} available)
            </label>
            <select
              id="note-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!!busy}
              className="w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm font-mono"
            >
              {notes.map((n, i) => (
                <option key={n.commitmentHex} value={n.commitmentHex}>
                  Note {notes.length - i} ·{" "}
                  {new Date(n.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Say something as a verified anonymous supporter…"
            maxLength={MESSAGE_MAX}
            rows={3}
            disabled={!!busy}
            className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm resize-none disabled:opacity-60"
          />
          <p className="text-xs text-[var(--color-ink-muted)] mt-1 text-right font-mono">
            {message.length}/{MESSAGE_MAX}
          </p>
        </div>

        <Button
          type="submit"
          disabled={!!busy || message.trim().length === 0}
          variant="primary"
          size="lg"
          fullWidth
        >
          {busy ? (
            <>
              <Spinner size={16} />
              {busy}
            </>
          ) : (
            "Post anonymous message"
          )}
        </Button>
      </form>
    </Card>
  );
}
