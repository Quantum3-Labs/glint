import type { DepositNote } from "./client";

/**
 * Local, client-only storage for patronage deposit notes.
 *
 * A note (secret + nullifier) is the ONLY thing that lets a supporter post
 * anonymously later. It is stored in localStorage and never sent to the server.
 * Losing it means losing the ability to post for that tip. A production build
 * should offer an export/download and a clearer "this is your secret" UX.
 */

const KEY = "glint.patronage.notes";

type StoredNote = DepositNote & { commitmentHex: string; createdAt: number };

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

export function saveNote(note: DepositNote, commitmentHex: string): void {
  const all = readAll();
  all.push({ ...note, commitmentHex, createdAt: Date.now() });
  writeAll(all);
}

/** Notes for a given creator slug, newest first. */
export function notesForSlug(slug: string): StoredNote[] {
  return readAll()
    .filter((n) => n.slug === slug)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Drop a note after its single post (the nullifier is now spent on-chain, so it
 * can never post again). Keeps the dropdown showing only usable notes.
 */
export function removeNote(commitmentHex: string): void {
  if (typeof window === "undefined") return;
  writeAll(readAll().filter((n) => n.commitmentHex !== commitmentHex));
}
