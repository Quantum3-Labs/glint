"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, UserIcon } from "@/components/ui/EmptyState";
import { InitialAvatar } from "@/components/ui/InitialAvatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { API_ENDPOINTS, ApiError, apiClient } from "@/lib/api";
import type { Creator } from "@/lib/creators/types";
import { useWalletStore } from "@/stores/wallet";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; creators: Creator[]; total: number }
  | { kind: "error"; message: string };

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Browse + search creators. Client component that hits /api/creators.
 */
export function BrowseCreators() {
  const address = useWalletStore((s) => s.address);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedSearch(search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [search]);

  const fetchCreators = useCallback(async (q: string) => {
    setState({ kind: "loading" });
    try {
      const { data } = await apiClient.get<{
        creators: Creator[];
        total: number;
      }>(API_ENDPOINTS.CREATORS, {
        params: {
          ...(q ? { search: q } : {}),
          limit: 50,
        },
      });
      setState({
        kind: "loaded",
        creators: data.creators ?? [],
        total: data.total ?? 0,
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : ((err as Error).message ?? "Failed to load creators");
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    fetchCreators(debouncedSearch);
  }, [debouncedSearch, fetchCreators]);

  return (
    <div className="space-y-6">
      <div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or handle…"
          className="w-full h-12 px-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        />
      </div>

      {state.kind === "loading" && (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i}>
              <Card>
                <div className="flex items-center gap-3 mb-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3 mt-1" />
              </Card>
            </li>
          ))}
        </ul>
      )}

      {state.kind === "error" && (
        <p className="text-sm text-[var(--color-error)]">{state.message}</p>
      )}

      {state.kind === "loaded" && state.creators.length === 0 && (
        <EmptyState
          icon={<UserIcon />}
          title={
            debouncedSearch
              ? `No creators match "${debouncedSearch}"`
              : "No creators yet"
          }
          description={
            debouncedSearch
              ? "Try a different search term."
              : "Be the first — create a profile and start receiving tips."
          }
          action={
            !debouncedSearch && (
              <Link href="/create">
                <Button variant="primary">Create profile</Button>
              </Link>
            )
          }
        />
      )}

      {state.kind === "loaded" && state.creators.length > 0 && (
        <>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {state.total} creator{state.total === 1 ? "" : "s"}
            {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
          </p>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.creators.map((creator) => (
              <li key={creator.slug}>
                <Link href={`/${creator.slug}`} className="block h-full">
                  <Card className="h-full hover:border-[var(--color-border-strong)] transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      <InitialAvatar name={creator.displayName} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-lg leading-tight truncate">
                            {creator.displayName}
                          </span>
                          {address === creator.walletAddress && (
                            <span className="shrink-0 rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-accent-ink)]">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-[var(--color-ink-muted)] truncate">
                          @{creator.slug}
                        </div>
                      </div>
                    </div>
                    {creator.bio && (
                      <p className="text-sm text-[var(--color-ink-soft)] line-clamp-2 mb-3">
                        {creator.bio}
                      </p>
                    )}
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      Joined{" "}
                      {new Date(creator.createdAt).toLocaleDateString(
                        undefined,
                        { year: "numeric", month: "short", day: "numeric" },
                      )}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
