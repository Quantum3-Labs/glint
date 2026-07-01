"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/Skeleton";
import { shortenAddress } from "@/lib/stellar";
import { useWalletStore } from "@/stores/wallet";

/**
 * Connected-wallet pill + dropdown. Clicking the pill opens a menu with the full
 * address, live balances, and a Disconnect button — instead of the old
 * click-to-instantly-disconnect footgun. Closes on outside click or Escape.
 */
export function WalletMenu() {
  const address = useWalletStore((s) => s.address);
  const xlmBalance = useWalletStore((s) => s.xlmBalance);
  const usdcBalance = useWalletStore((s) => s.usdcBalance);
  const hasUsdcTrustline = useWalletStore((s) => s.hasUsdcTrustline);
  const isLoadingBalances = useWalletStore((s) => s.isLoadingBalances);
  const refreshBalances = useWalletStore((s) => s.refreshBalances);
  const disconnect = useWalletStore((s) => s.disconnect);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Refresh balances each time the menu opens.
  useEffect(() => {
    if (open) refreshBalances();
  }, [open, refreshBalances]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!address) return null;

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied");
    } catch {
      toast.error("Couldn't copy address");
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Wallet"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-sunken)] hover:border-[var(--color-border-strong)] transition-colors text-sm"
      >
        <span
          className="w-2 h-2 rounded-full bg-[var(--color-success)]"
          aria-hidden="true"
        />
        <span className="font-mono">{shortenAddress(address)}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg p-4 z-50">
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-1">
              Connected
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm text-[var(--color-ink)]">
                {shortenAddress(address, 6, 6)}
              </span>
              <button
                type="button"
                onClick={copyAddress}
                className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
                Balances
              </span>
              <button
                type="button"
                onClick={refreshBalances}
                disabled={isLoadingBalances}
                className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline disabled:opacity-50"
              >
                {isLoadingBalances ? "Loading…" : "Refresh"}
              </button>
            </div>
            <BalanceRow
              label="XLM"
              icon="/tokens/xlm.svg"
              value={xlmBalance}
              loading={isLoadingBalances && xlmBalance === null}
            />
            {hasUsdcTrustline ? (
              <BalanceRow
                label="USDC"
                icon="/tokens/usdc.svg"
                value={usdcBalance ?? "0"}
                loading={isLoadingBalances && usdcBalance === null}
              />
            ) : (
              <div className="flex items-baseline justify-between text-sm">
                <span className="flex items-center gap-2 text-[var(--color-ink-soft)]">
                  <TokenIcon src="/tokens/usdc.svg" label="USDC" />
                  USDC
                </span>
                <span className="text-xs text-[var(--color-warn)]">
                  No trustline
                </span>
              </div>
            )}
          </div>

          {!hasUsdcTrustline && xlmBalance !== null && xlmBalance !== "0" && (
            <p className="text-xs text-[var(--color-ink-muted)] pt-3 mt-3 border-t border-[var(--color-border)]">
              Add a USDC trustline in Freighter → Manage Assets to receive tips.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
            className="mt-4 w-full h-10 rounded-md border border-[var(--color-border)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] transition-colors text-sm"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function TokenIcon({ src, label }: { src: string; label: string }) {
  return (
    // biome-ignore lint/performance/noImgElement: tiny static SVG, next/image is overkill
    <img
      src={src}
      alt={`${label} icon`}
      width={18}
      height={18}
      className="rounded-full"
    />
  );
}

function BalanceRow({
  label,
  icon,
  value,
  loading,
}: {
  label: string;
  icon: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="flex items-center gap-2 text-[var(--color-ink-soft)]">
        <TokenIcon src={icon} label={label} />
        {label}
      </span>
      {loading ? (
        <Skeleton className="h-4 w-20" />
      ) : (
        <span className="font-mono text-[var(--color-ink)]">
          {value ?? "—"}
        </span>
      )}
    </div>
  );
}
