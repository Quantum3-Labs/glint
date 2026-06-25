"use client";

import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { generatePostProof } from "@/lib/patronage/client";
import { notesForSlug } from "@/lib/patronage/notes";

const MESSAGE_MAX = 280;

type Note = ReturnType<typeof notesForSlug>[number];

/**
 * Lets a supporter who has a saved deposit note post an anonymous, proof-backed
 * message. Proof generation happens entirely in the browser; only the proof +
 * message reach the server (which relays it on-chain).
 */
export function AnonPostForm({ slug }: { slug: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const ns = notesForSlug(slug);
    setNotes(ns);
    if (ns[0]) setSelected(ns[0].commitmentHex);
  }, [slug]);

  if (notes.length === 0) {
    return (
      <Card padding="lg">
        <h2 className="font-display text-2xl mb-2">Post anonymously</h2>
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
    const note = notes.find((n) => n.commitmentHex === selected);
    if (!note || message.trim().length === 0) return;

    try {
      setBusy("Building Merkle path…");
      const pathRes = await fetch("/api/patronage/path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitmentHex: note.commitmentHex }),
      });
      if (!pathRes.ok)
        throw new Error((await pathRes.json()).error ?? "path failed");
      const path = await pathRes.json();

      setBusy("Generating proof (this can take a moment)…");
      const { proofHex, publicInputsHex } = await generatePostProof(
        note,
        message.trim(),
        path,
      );

      setBusy("Posting on-chain…");
      const postRes = await fetch("/api/patronage/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicInputsHex,
          proofHex,
          message: message.trim(),
        }),
      });
      const result = await postRes.json();
      if (!postRes.ok || !result.ok) {
        throw new Error(result.error ?? "post failed");
      }

      toast.success("Anonymous message posted", {
        description: "It is verified on-chain but unlinkable to your wallet.",
      });
      setMessage("");
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to post");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padding="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h2 className="font-display text-2xl">Post anonymously</h2>
          <p className="text-xs text-[var(--color-ink-muted)] mt-1">
            Prove you tipped — without revealing which wallet or payment.
          </p>
        </div>

        {notes.length > 1 && (
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!!busy}
            className="w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm font-mono"
          >
            {notes.map((n) => (
              <option key={n.commitmentHex} value={n.commitmentHex}>
                note {n.commitmentHex.slice(0, 10)}… ·{" "}
                {new Date(n.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Say something as a verified anonymous supporter…"
          maxLength={MESSAGE_MAX}
          rows={3}
          disabled={!!busy}
          className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm resize-none disabled:opacity-60"
        />

        <Button
          type="submit"
          disabled={!!busy}
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
