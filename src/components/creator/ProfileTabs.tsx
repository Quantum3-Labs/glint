"use client";

import { useEffect, useState } from "react";
import { ActivityWall } from "@/components/creator/ActivityWall";
import { PrivatePatronage } from "@/components/creator/PrivatePatronage";
import { TipForm } from "@/components/creator/TipForm";
import { TipWall } from "@/components/creator/TipWall";

type Tab = "public" | "private";

const TAB_KEY = "glint.profileTab";

/**
 * Two ways to support a creator, as tabs:
 *  - "Tip publicly"     — instant x402 USDC tip, your wallet + note on the wall.
 *  - "Support privately" — deposit into the ZK pool, then pay / message / vote
 *                          anonymously, unlinkable to your wallet.
 *
 * The contrast is the point: same creator, one flow reveals your wallet, the
 * other doesn't. Public is the default (lowest-friction, most visitors).
 */
export function ProfileTabs({
  slug,
  displayName,
  creatorWallet,
}: {
  slug: string;
  displayName: string;
  creatorWallet: string;
}) {
  const [tab, setTab] = useState<Tab>("public");

  // Restore the last-used tab after mount (avoids an SSR hydration mismatch).
  useEffect(() => {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === "public" || saved === "private") setTab(saved);
  }, []);

  function select(next: Tab) {
    setTab(next);
    localStorage.setItem(TAB_KEY, next);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Ways to support"
        className="flex gap-6 border-b border-[var(--color-border)] mb-6"
      >
        <TabButton active={tab === "public"} onClick={() => select("public")}>
          Tip publicly
        </TabButton>
        <TabButton active={tab === "private"} onClick={() => select("private")}>
          Support privately
        </TabButton>
      </div>

      {tab === "public" ? (
        <section className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
          <TipForm slug={slug} displayName={displayName} />
          <TipWall slug={slug} />
        </section>
      ) : (
        <section className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
          <PrivatePatronage slug={slug} creatorWallet={creatorWallet} />
          <ActivityWall slug={slug} />
        </section>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px pb-3 text-sm border-b-2 transition-colors ${
        active
          ? "border-[var(--color-accent)] text-[var(--color-ink)] font-medium"
          : "border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      }`}
    >
      {children}
    </button>
  );
}
