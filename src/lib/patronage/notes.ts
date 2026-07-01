import type { DepositNote } from "./client";

/**
 * Local, client-only storage for patronage deposit notes.
 *
 * A note (secret + nullifier) is the ONLY thing that lets a supporter act
 * anonymously later. It is stored in localStorage and never sent to the server.
 * Losing it means losing the ability to act for that deposit. A production build
 * should offer an export/download and a clearer "this is your secret" UX.
 *
 * Notes are kept even after their one-shot actions (withdraw, message) are
 * spent, because a note can still vote (per-poll, domain-separated nullifier).
 *
 * Each note records the `owner` wallet that deposited it, so switching Freighter
 * accounts in the same browser shows only that account's notes.
 */

const KEY = "glint.patronage.notes";

type StoredNote = DepositNote & {
  commitmentHex: string;
  createdAt: number;
  /** wallet address that made the deposit */
  owner: string;
};

function readAll(): StoredNote[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeAll(notes: StoredNote[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(notes));
}

export function saveNote(
  note: DepositNote,
  commitmentHex: string,
  owner: string,
): void {
  const all = readAll();
  all.push({ ...note, commitmentHex, createdAt: Date.now(), owner });
  writeAll(all);
}

/** Notes for a given creator slug + owner wallet, newest first. */
export function notesForSlug(slug: string, owner: string): StoredNote[] {
  return readAll()
    .filter((n) => n.slug === slug && n.owner === owner)
    .sort((a, b) => b.createdAt - a.createdAt);
}
