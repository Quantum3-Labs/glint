import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Firestore } from "@google-cloud/firestore";

/**
 * Poll metadata store for anonymous voting.
 *
 * On-chain the contract only holds the option count + tallies + nullifiers; the
 * human-readable question and option labels live here (off-chain), keyed by
 * creator slug. Backend mirrors the creators store: Firestore in production
 * (`STORE_TYPE=firestore`), a JSON file for local dev.
 */

export type Poll = {
  /** Sequential id per creator; also the on-chain poll_id. */
  id: number;
  question: string;
  options: string[];
  createdAt: string;
};

interface PollStore {
  list(slug: string): Promise<Poll[]>;
  add(slug: string, poll: Omit<Poll, "id" | "createdAt">): Promise<Poll>;
}

// ── JSON file backend ─────────────────────────────────────────────────────────

type StoreFile = { version: 1; polls: Record<string, Poll[]> };

class JsonPollStore implements PollStore {
  constructor(private readonly filePath: string) {}

  async list(slug: string): Promise<Poll[]> {
    const data = await this.load();
    return data.polls[slug] ?? [];
  }

  async add(slug: string, poll: Omit<Poll, "id" | "createdAt">): Promise<Poll> {
    const data = await this.load();
    const existing = data.polls[slug] ?? [];
    const created: Poll = {
      ...poll,
      id: existing.length,
      createdAt: new Date().toISOString(),
    };
    data.polls[slug] = [...existing, created];
    await this.save(data);
    return created;
  }

  private async load(): Promise<StoreFile> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as StoreFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, polls: {} };
      }
      throw err;
    }
  }

  private async save(data: StoreFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}

// ── Firestore backend ─────────────────────────────────────────────────────────

class FirestorePollStore implements PollStore {
  private readonly db = new Firestore();
  private readonly collection = "polls";

  async list(slug: string): Promise<Poll[]> {
    const snap = await this.db.collection(this.collection).doc(slug).get();
    return (snap.data()?.polls as Poll[]) ?? [];
  }

  async add(slug: string, poll: Omit<Poll, "id" | "createdAt">): Promise<Poll> {
    const ref = this.db.collection(this.collection).doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = (snap.data()?.polls as Poll[]) ?? [];
      const created: Poll = {
        ...poll,
        id: existing.length,
        createdAt: new Date().toISOString(),
      };
      tx.set(ref, { polls: [...existing, created] });
      return created;
    });
  }
}

let _store: PollStore | null = null;

export function getPollStore(): PollStore {
  if (_store) return _store;
  _store =
    process.env.STORE_TYPE === "firestore"
      ? new FirestorePollStore()
      : new JsonPollStore(
          resolve(process.env.POLLS_STORE_PATH ?? ".data/polls.json"),
        );
  return _store;
}
