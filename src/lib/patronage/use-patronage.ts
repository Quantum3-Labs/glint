"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useWalletStore } from "@/stores/wallet";
import { stellarExpertTxUrl } from "../stellar";
import {
  generateMessageProof,
  generateVoteProof,
  generateWithdrawProof,
} from "./client";
import { depositToPool } from "./deposit";
import { friendlyError } from "./errors";
import { dispatchPatronagePosted } from "./events";
import { bytes32ToField, DOMAIN, hexToBytes } from "./fields";
import { buildMerklePath } from "./merkle";
import { notesForSlug, removeNote } from "./notes";
import { nullifierHash } from "./poseidon";

export type StoredNote = ReturnType<typeof notesForSlug>[number];

/** A note plus which single-use actions it has already spent on-chain. */
export type NoteState = StoredNote & {
  withdrawSpent: boolean;
  messageSpent: boolean;
};

type Path = { siblings: string[]; bits: number[]; root: string };

/**
 * Owns the private-patronage flow for a creator: the supporter's deposit notes
 * (with per-action spent status), the client-signed deposit, and the browser
 * proof -> relay for withdraw / message / vote. Keeps the UI presentational.
 */
export function usePatronage(slug: string) {
  const address = useWalletStore((s) => s.address);
  const refreshBalances = useWalletStore((s) => s.refreshBalances);
  const [notes, setNotes] = useState<NoteState[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refreshNotes = useCallback(async () => {
    const ns = notesForSlug(slug);
    if (ns.length === 0) {
      setNotes([]);
      return;
    }
    // For each note, the withdraw and message nullifiers are independent.
    const withdraw = await Promise.all(
      ns.map(async (n) =>
        (
          await nullifierHash(BigInt(n.nullifier), DOMAIN.WITHDRAW, 0n)
        ).toString(),
      ),
    );
    const message = await Promise.all(
      ns.map(async (n) =>
        (
          await nullifierHash(BigInt(n.nullifier), DOMAIN.MESSAGE, 0n)
        ).toString(),
      ),
    );

    let spentSet = new Set<string>();
    try {
      const res = await fetch("/api/patronage/spent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nullifierHashes: [...withdraw, ...message] }),
      });
      if (res.ok) {
        const { spent } = (await res.json()) as { spent: string[] };
        spentSet = new Set(spent);
      }
    } catch {
      // network error -> treat nothing as spent (actions will fail loudly if so)
    }

    const next: NoteState[] = ns.map((n, i) => ({
      ...n,
      withdrawSpent: spentSet.has(withdraw[i]),
      messageSpent: spentSet.has(message[i]),
    }));
    // Drop notes whose main actions are both used up.
    next.forEach((n) => {
      if (n.withdrawSpent && n.messageSpent) removeNote(n.commitmentHex);
    });
    setNotes(next.filter((n) => !(n.withdrawSpent && n.messageSpent)));
  }, [slug]);

  useEffect(() => {
    refreshNotes();
  }, [refreshNotes]);

  /** Build the tier-tree Merkle path for a note (fetches that tier's leaves). */
  const buildPath = useCallback(async (note: StoredNote): Promise<Path> => {
    const res = await fetch(
      `/api/patronage/leaves?tier=${encodeURIComponent(note.tier)}`,
    );
    if (!res.ok) throw new Error("could not read pool leaves");
    const { leaves: leavesHex } = (await res.json()) as { leaves: string[] };
    const leaves = leavesHex.map((h) => bytes32ToField(hexToBytes(h)));
    const leafIndex = leaves.indexOf(
      bytes32ToField(hexToBytes(note.commitmentHex)),
    );
    if (leafIndex < 0) {
      throw new Error(
        "commitment not found in pool (deposit not settled yet?)",
      );
    }
    const { siblings, bits, root } = await buildMerklePath(leaves, leafIndex);
    return {
      siblings: siblings.map((s) => s.toString()),
      bits,
      root: root.toString(),
    };
  }, []);

  /** Deposit a fixed tier into the pool (Freighter-signed). */
  const deposit = useCallback(
    async (tier: bigint): Promise<boolean> => {
      if (!address) {
        toast.error("Connect your wallet to deposit");
        return false;
      }
      try {
        setBusy("Waiting for Freighter…");
        const { txHash } = await depositToPool(slug, tier, address);
        toast.success("Deposited into the private pool", {
          description: "You can now support, message, or vote anonymously.",
          action: {
            label: "View tx",
            onClick: () => window.open(stellarExpertTxUrl(txHash), "_blank"),
          },
        });
        refreshBalances();
        await refreshNotes();
        return true;
      } catch (err) {
        console.error("[patronage] deposit failed:", err);
        toast.error(friendlyError(err));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [address, slug, refreshBalances, refreshNotes],
  );

  /** Privately pay the creator from a note (anonymous withdrawal). */
  const withdraw = useCallback(
    async (note: NoteState): Promise<boolean> => {
      try {
        setBusy("Building Merkle path…");
        const path = await buildPath(note);
        setBusy("Generating proof…");
        const { proofHex, publicInputsHex } = await generateWithdrawProof(
          note,
          path,
        );
        setBusy("Sending privately…");
        const res = await fetch("/api/patronage/withdraw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicInputsHex, proofHex }),
        });
        const result = await res.json();
        if (!res.ok || !result.ok)
          throw new Error(result.error ?? "withdraw failed");
        toast.success("Sent privately to the creator", {
          description: "Unlinkable to your deposit.",
          action: {
            label: "View tx",
            onClick: () =>
              window.open(stellarExpertTxUrl(result.txHash), "_blank"),
          },
        });
        await refreshNotes();
        return true;
      } catch (err) {
        console.error("[patronage] withdraw failed:", err);
        toast.error(friendlyError(err));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [buildPath, refreshNotes],
  );

  /** Post an anonymous message from a note. */
  const postMessage = useCallback(
    async (note: NoteState, message: string): Promise<boolean> => {
      if (message.length === 0) return false;
      try {
        setBusy("Building Merkle path…");
        const path = await buildPath(note);
        setBusy("Generating proof…");
        const { proofHex, publicInputsHex } = await generateMessageProof(
          note,
          message,
          path,
        );
        setBusy("Posting on-chain…");
        const res = await fetch("/api/patronage/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicInputsHex, proofHex, message }),
        });
        const result = await res.json();
        if (!res.ok || !result.ok)
          throw new Error(result.error ?? "post failed");
        toast.success("Anonymous message posted", {
          description: "Verified on-chain, unlinkable to your wallet.",
          action: {
            label: "View tx",
            onClick: () =>
              window.open(stellarExpertTxUrl(result.txHash), "_blank"),
          },
        });
        await refreshNotes();
        dispatchPatronagePosted(slug);
        return true;
      } catch (err) {
        console.error("[patronage] post failed:", err);
        toast.error(friendlyError(err));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [buildPath, refreshNotes, slug],
  );

  /** Cast an anonymous vote in a poll from a note. */
  const vote = useCallback(
    async (
      note: StoredNote,
      pollId: number,
      choice: number,
    ): Promise<boolean> => {
      try {
        setBusy("Building Merkle path…");
        const path = await buildPath(note);
        setBusy("Generating proof…");
        const { proofHex, publicInputsHex } = await generateVoteProof(
          note,
          pollId,
          choice,
          path,
        );
        setBusy("Submitting vote…");
        const res = await fetch("/api/patronage/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicInputsHex, proofHex, choice }),
        });
        const result = await res.json();
        if (!res.ok || !result.ok)
          throw new Error(result.error ?? "vote failed");
        toast.success("Vote cast anonymously", {
          description: "One vote per supporter, unlinkable to your wallet.",
        });
        return true;
      } catch (err) {
        console.error("[patronage] vote failed:", err);
        toast.error(friendlyError(err));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [buildPath],
  );

  return { notes, busy, deposit, withdraw, postMessage, vote, refreshNotes };
}
