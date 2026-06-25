"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { TIP_SENT_EVENT, type TipSentDetail } from "../tip-events";
import { generatePostProof } from "./client";
import { friendlyError } from "./errors";
import { dispatchPatronagePosted } from "./events";
import { notesForSlug, removeNote } from "./notes";
import { nullifierHash } from "./poseidon";

export type StoredNote = ReturnType<typeof notesForSlug>[number];

/**
 * Owns the anonymous-post flow for a creator: the supporter's deposit notes
 * (filtered to those still spendable on-chain), and the browser proof → relay
 * submit. Unlocks live when a tip completes; drops a note once it is posted.
 * Keeps `AnonPostForm` purely presentational.
 */
export function usePatronagePost(slug: string) {
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const refreshNotes = useCallback(async () => {
    const ns = notesForSlug(slug);
    let usable = ns;
    if (ns.length > 0) {
      // Hide notes whose nullifier is already spent on-chain (used up).
      try {
        const hashes = await Promise.all(
          ns.map(async (n) =>
            (await nullifierHash(BigInt(n.nullifier))).toString(),
          ),
        );
        const res = await fetch("/api/patronage/spent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nullifierHashes: hashes }),
        });
        if (res.ok) {
          const { spent } = (await res.json()) as { spent: string[] };
          const spentSet = new Set(spent);
          ns.forEach((n, i) => {
            if (spentSet.has(hashes[i])) removeNote(n.commitmentHex);
          });
          usable = ns.filter((_, i) => !spentSet.has(hashes[i]));
        }
      } catch {
        // network/proof error -> fall back to showing all notes
      }
    }
    setNotes(usable);
    setSelected((prev) =>
      usable.some((n) => n.commitmentHex === prev)
        ? prev
        : (usable[0]?.commitmentHex ?? ""),
    );
  }, [slug]);

  useEffect(() => {
    refreshNotes();
    // Unlock live when a tip for this creator completes (no page refresh).
    function onTipSent(e: Event) {
      if ((e as CustomEvent<TipSentDetail>).detail?.slug === slug) {
        refreshNotes();
      }
    }
    window.addEventListener(TIP_SENT_EVENT, onTipSent);
    return () => window.removeEventListener(TIP_SENT_EVENT, onTipSent);
  }, [slug, refreshNotes]);

  /** Generate a proof for `selected` + `message` and relay it. */
  const submit = useCallback(
    async (message: string): Promise<boolean> => {
      const note = notes.find((n) => n.commitmentHex === selected);
      if (!note || message.length === 0) return false;

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
          message,
          path,
        );

        setBusy("Posting on-chain…");
        const postRes = await fetch("/api/patronage/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicInputsHex, proofHex, message }),
        });
        const result = await postRes.json();
        if (!postRes.ok || !result.ok) {
          throw new Error(result.error ?? "post failed");
        }

        toast.success("Anonymous message posted", {
          description: "It is verified on-chain but unlinkable to your wallet.",
        });
        removeNote(note.commitmentHex); // spent — drop it from the list
        refreshNotes();
        dispatchPatronagePosted(slug); // let AnonWall refetch
        return true;
      } catch (err) {
        console.error("[patronage] post failed:", err); // raw for debugging
        toast.error(friendlyError(err));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [notes, selected, slug, refreshNotes],
  );

  return { notes, selected, setSelected, busy, submit };
}
