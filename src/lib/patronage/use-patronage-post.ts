"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { stellarExpertTxUrl } from "../stellar";
import { TIP_SENT_EVENT, type TipSentDetail } from "../tip-events";
import { generatePostProof } from "./client";
import { friendlyError } from "./errors";
import { dispatchPatronagePosted } from "./events";
import { bytes32ToField, hexToBytes } from "./fields";
import { buildMerklePath } from "./merkle";
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
        // Server returns only the raw leaf list; the path is rebuilt here in the
        // browser (bb.js is already loaded for proving) so the API runs no wasm.
        const leavesRes = await fetch("/api/patronage/leaves");
        if (!leavesRes.ok) throw new Error("could not read pool leaves");
        const { leaves: leavesHex } = (await leavesRes.json()) as {
          leaves: string[];
        };
        const leaves = leavesHex.map((h) => bytes32ToField(hexToBytes(h)));
        const leafIndex = leaves.indexOf(
          bytes32ToField(hexToBytes(note.commitmentHex)),
        );
        if (leafIndex < 0) {
          throw new Error(
            "commitment not found in pool (deposit not settled yet?)",
          );
        }
        const { siblings, bits, root } = await buildMerklePath(
          leaves,
          leafIndex,
        );

        setBusy("Generating proof (this can take a moment)…");
        const { proofHex, publicInputsHex } = await generatePostProof(
          note,
          message,
          {
            siblings: siblings.map((s) => s.toString()),
            bits,
            root: root.toString(),
          },
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

        const txHash: string | undefined = result.txHash;
        toast.success("Anonymous message posted", {
          description: "Verified on-chain, unlinkable to your wallet.",
          action: txHash
            ? {
                label: "View tx",
                onClick: () =>
                  window.open(stellarExpertTxUrl(txHash), "_blank"),
              }
            : undefined,
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
