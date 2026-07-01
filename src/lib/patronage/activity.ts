import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Firestore } from "@google-cloud/firestore";

/**
 * Off-chain activity log for the anonymous Activity wall.
 *
 * The server relays every anonymous action, so it knows the details + the tx
 * hash at relay time and records them here, keyed by creator slug. On-chain
 * state stays the source of truth (get_wall / get_tally); this is a display
 * index that attaches the tx hash so anyone can open the action on-chain and see
 * it is unlinkable to a wallet. No wallet is stored — actions are relayed.
 */

export type ActivityItem = {
  type: "payment" | "message" | "vote";
  /** deposit tier in stroops (the "$X supporter" badge) */
  tier: string;
  /** message text (type === "message") */
  message?: string;
  /** poll id + choice index (type === "vote") */
  pollId?: number;
  choice?: number;
  txHash: string;
  createdAt: number;
};

interface ActivityStore {
  list(slug: string): Promise<ActivityItem[]>;
  add(slug: string, item: ActivityItem): Promise<void>;
}

// ── JSON file backend ─────────────────────────────────────────────────────────

type StoreFile = { version: 1; activity: Record<string, ActivityItem[]> };

class JsonActivityStore implements ActivityStore {
  constructor(private readonly filePath: string) {}

  async list(slug: string): Promise<ActivityItem[]> {
    const data = await this.load();
    return [...(data.activity[slug] ?? [])].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  async add(slug: string, item: ActivityItem): Promise<void> {
    const data = await this.load();
    data.activity[slug] = [...(data.activity[slug] ?? []), item];
    await this.save(data);
  }

  private async load(): Promise<StoreFile> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as StoreFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, activity: {} };
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

class FirestoreActivityStore implements ActivityStore {
  private readonly db = new Firestore();
  private readonly collection = "activity";

  async list(slug: string): Promise<ActivityItem[]> {
    const snap = await this.db.collection(this.collection).doc(slug).get();
    return ((snap.data()?.items as ActivityItem[]) ?? []).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  async add(slug: string, item: ActivityItem): Promise<void> {
    const ref = this.db.collection(this.collection).doc(slug);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const items = (snap.data()?.items as ActivityItem[]) ?? [];
      tx.set(ref, { items: [...items, item] });
    });
  }
}

/** Append an activity item, swallowing errors (the on-chain action already
 * succeeded — a failed log write must not fail the response). */
export async function recordActivity(
  slug: string,
  item: ActivityItem,
): Promise<void> {
  try {
    await getActivityStore().add(slug, item);
  } catch (err) {
    console.error(`[patronage/activity/${slug}]`, (err as Error).message);
  }
}

let _store: ActivityStore | null = null;

export function getActivityStore(): ActivityStore {
  if (_store) return _store;
  _store =
    process.env.STORE_TYPE === "firestore"
      ? new FirestoreActivityStore()
      : new JsonActivityStore(
          resolve(process.env.ACTIVITY_STORE_PATH ?? ".data/activity.json"),
        );
  return _store;
}
