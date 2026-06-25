"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState, SparkleIcon } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { API_ENDPOINTS, ApiError, apiClient } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format-time";
import {
  shortenAddress,
  stellarExpertTxUrl,
  stroopsToUsdc,
} from "@/lib/stellar";
import { TIP_SENT_EVENT, type TipSentDetail } from "@/lib/tip-events";

/**
 * Polling schedule (ms) after a tip is sent. Server blocks on on-chain
 * SUCCESS before returning, so attempt 1 usually wins — later attempts
 * cover rare RPC read lag.
 */
const REFETCH_DELAYS_MS = [300, 2000, 4000, 8000];

type WallMessage = {
  from: string;
  amount: string;
  note: string;
  timestamp: string;
  txHash: string;
};

type State =
  | { kind: "loading" }
  | { kind: "loaded"; messages: WallMessage[] }
  | { kind: "error"; message: string };

type Props = { slug: string };

/**
 * Tipping wall — displays tip messages stored on-chain in the TipJar contract.
 *
 * After a tip is sent, schedules an exponential-backoff refetch: stops as
 * soon as the wall sees more messages than it had before the tip. New items
 * are highlighted briefly (see `newTipGlow` keyframes in globals.css).
 */
export function TipWall({ slug }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [syncing, setSyncing] = useState(false);
  const [pendingSlot, setPendingSlot] = useState(false);
  const [freshTxHashes, setFreshTxHashes] = useState<Set<string>>(new Set());
  const freshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMessages = useCallback(async (): Promise<WallMessage[]> => {
    const { data } = await apiClient.get<{ messages: WallMessage[] }>(
      API_ENDPOINTS.tipMessages(slug),
    );
    // Contract returns newest-first; trust the ordering here.
    return data.messages ?? [];
  }, [slug]);

  const loadInitial = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "loaded", messages: await fetchMessages() });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : ((err as Error).message ?? "Failed to load wall");
      setState({ kind: "error", message });
    }
  }, [fetchMessages]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Clean up the fresh-highlight timer on unmount.
  useEffect(() => {
    return () => {
      if (freshTimerRef.current) clearTimeout(freshTimerRef.current);
    };
  }, []);

  // When a tip is sent for this creator, poll the wall until the count
  // increases, then surface the new item with a highlight.
  useEffect(() => {
    let disposed = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    function onTipSent(e: Event) {
      const detail = (e as CustomEvent<TipSentDetail>).detail;
      if (detail?.slug !== slug) return;

      const baseline =
        state.kind === "loaded" ? state.messages.length : undefined;
      if (baseline === undefined) return;

      // Clear any prior polling cycle for a previous tip.
      for (const t of timers) clearTimeout(t);
      timers.length = 0;

      setSyncing(true);
      setPendingSlot(true);

      let settled = false;
      for (const [i, delay] of REFETCH_DELAYS_MS.entries()) {
        const timer = setTimeout(async () => {
          if (disposed || settled) return;
          try {
            const next = await fetchMessages();
            if (disposed || settled) return;

            if (next.length > baseline) {
              settled = true;
              setState({ kind: "loaded", messages: next });
              setSyncing(false);
              setPendingSlot(false);

              const previousHashes = new Set(
                state.kind === "loaded"
                  ? state.messages.map((m) => m.txHash)
                  : [],
              );
              const fresh = new Set(
                next
                  .filter((m) => !previousHashes.has(m.txHash))
                  .map((m) => m.txHash),
              );
              setFreshTxHashes(fresh);

              if (freshTimerRef.current) clearTimeout(freshTimerRef.current);
              freshTimerRef.current = setTimeout(
                () => setFreshTxHashes(new Set()),
                3500,
              );
            } else if (i === REFETCH_DELAYS_MS.length - 1) {
              // Gave up waiting — let the user know the wall is catching up.
              setSyncing(false);
              setPendingSlot(false);
              const { toast } = await import("sonner");
              toast.info(
                "Tip recorded on-chain — the wall may take a moment to catch up.",
              );
            }
          } catch {
            if (i === REFETCH_DELAYS_MS.length - 1) {
              setSyncing(false);
              setPendingSlot(false);
            }
          }
        }, delay);
        timers.push(timer);
      }
    }

    window.addEventListener(TIP_SENT_EVENT, onTipSent);
    return () => {
      disposed = true;
      window.removeEventListener(TIP_SENT_EVENT, onTipSent);
      for (const t of timers) clearTimeout(t);
    };
  }, [slug, state, fetchMessages]);

  return (
    <Card padding="lg">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-2xl">Tipping wall</h2>
          <p className="text-xs text-[var(--color-ink-muted)] mt-1">
            Every tip recorded on Stellar
          </p>
        </div>
        <div className="flex items-center gap-3">
          {syncing && (
            <span className="inline-flex items-center gap-2 text-xs text-[var(--color-accent)]">
              <Spinner size={12} />
              Syncing…
            </span>
          )}
          <button
            type="button"
            onClick={loadInitial}
            disabled={state.kind === "loading" || syncing}
            className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline disabled:opacity-50"
          >
            {state.kind === "loading" ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {state.kind === "loading" && (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {state.kind === "error" && (
        <p className="text-sm text-[var(--color-error)]">{state.message}</p>
      )}

      {state.kind === "loaded" &&
        state.messages.length === 0 &&
        !pendingSlot && (
          <EmptyState
            icon={<SparkleIcon />}
            title="No tips yet"
            description="Be the first — every message gets etched into the Stellar ledger."
            className="border-none bg-transparent p-4"
          />
        )}

      {state.kind === "loaded" &&
        (state.messages.length > 0 || pendingSlot) && (
          <ul className="space-y-4">
            {pendingSlot && <PendingTipSlot />}
            {state.messages.map((msg) => (
              <TipWallItem
                key={`${msg.txHash}-${msg.timestamp}`}
                msg={msg}
                fresh={freshTxHashes.has(msg.txHash)}
              />
            ))}
          </ul>
        )}
    </Card>
  );
}

function PendingTipSlot() {
  return (
    <li className="pb-4 border-b border-[var(--color-border)] animate-pulse">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="space-y-2 flex-1">
          <div className="h-3 w-32 rounded bg-[var(--color-surface-sunken)]" />
          <div className="h-3 w-20 rounded bg-[var(--color-surface-sunken)]" />
        </div>
        <div className="h-5 w-16 rounded bg-[var(--color-surface-sunken)]" />
      </div>
    </li>
  );
}

function TipWallItem({ msg, fresh }: { msg: WallMessage; fresh: boolean }) {
  const hasNote = msg.note.trim().length > 0;
  const when = formatRelativeTime(msg.timestamp);

  return (
    <li
      className={`pb-4 border-b border-[var(--color-border)] last:border-0 last:pb-0 -mx-2 px-2 rounded-md ${fresh ? "animate-[newTipGlow_3s_ease-out]" : ""}`}
    >
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="min-w-0">
          <div className="text-sm text-[var(--color-ink)] font-medium truncate">
            <span className="font-mono">{shortenAddress(msg.from)}</span>
          </div>
          <div className="text-xs text-[var(--color-ink-muted)] flex items-center gap-2">
            <span>{when}</span>
            {msg.txHash && (
              <>
                <span aria-hidden="true">·</span>
                <a
                  href={stellarExpertTxUrl(msg.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline"
                >
                  View tx
                </a>
              </>
            )}
          </div>
        </div>
        <div className="font-display text-lg text-[var(--color-accent)] shrink-0">
          +${stroopsToUsdc(msg.amount)}
        </div>
      </div>
      {hasNote && (
        <p className="mt-2 pl-3 border-l-2 border-[var(--color-border)] text-sm text-[var(--color-ink-soft)] whitespace-pre-wrap break-words">
          {msg.note}
        </p>
      )}
    </li>
  );
}
