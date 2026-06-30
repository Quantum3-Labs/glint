"use client";

import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  EmptyState,
  SparkleGlyph,
  WalletIcon,
} from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { type FormStatus, isBusy } from "@/lib/form-status";
import { createFreighterSigner } from "@/lib/freighter";
import { stellarExpertTxUrl } from "@/lib/stellar";
import { dispatchTipSent } from "@/lib/tip-events";
import {
  MAX_TIP_AMOUNT,
  MIN_TIP_AMOUNT,
  TIP_MESSAGE_MAX,
} from "@/lib/tip-limits";
import { useWalletStore } from "@/stores/wallet";

const PRESET_AMOUNTS = ["0.50", "1.00", "5.00", "10.00"];

type Props = {
  slug: string;
  displayName: string;
};

type TipSuccess = {
  amount: string;
  txHash: string | null;
  recordedOnChain: boolean | null;
};

type TipResponseBody = {
  ok: boolean;
  txHash?: string;
  recordedOnChain?: boolean | null;
};

export function TipForm({ slug, displayName }: Props) {
  const address = useWalletStore((s) => s.address);
  const hasUsdcTrustline = useWalletStore((s) => s.hasUsdcTrustline);
  const refreshBalances = useWalletStore((s) => s.refreshBalances);

  const [selectedAmount, setSelectedAmount] = useState("1.00");
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<FormStatus<TipSuccess>>({
    kind: "idle",
  });

  if (!address) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={<WalletIcon />}
          title="Connect to tip"
          description="Tips are sent in USDC on Stellar Testnet via the x402 protocol. You'll need Freighter and a USDC trustline."
          className="border-none p-0 bg-transparent"
        />
      </Card>
    );
  }

  const finalAmount =
    customAmount.trim() !== "" ? customAmount.trim() : selectedAmount;

  const busy = isBusy(status);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!address) return;

    const parsed = Number.parseFloat(finalAmount);
    if (
      !Number.isFinite(parsed) ||
      parsed < MIN_TIP_AMOUNT ||
      parsed > MAX_TIP_AMOUNT
    ) {
      setStatus({
        kind: "error",
        message: `Amount must be between $${MIN_TIP_AMOUNT} and $${MAX_TIP_AMOUNT} USDC`,
      });
      return;
    }

    try {
      setStatus({ kind: "busy", label: "Waiting for Freighter…" });

      const signer = createFreighterSigner(address);
      const client = new x402Client().register(
        "stellar:*",
        new ExactStellarScheme(signer),
      );
      const fetchWithPayment = wrapFetchWithPayment(fetch, client);

      setStatus({ kind: "busy", label: "Processing payment…" });

      const url = `/api/tip/${encodeURIComponent(slug)}?amount=${encodeURIComponent(finalAmount)}`;
      const body = JSON.stringify({
        message: message.trim() || undefined,
        from: address,
      });
      const response = await fetchWithPayment(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const text = await response.text();

      if (!response.ok) {
        const errMsg = `Tip failed (${response.status})`;
        setStatus({ kind: "error", message: errMsg });
        toast.error(errMsg);
        return;
      }

      let parsedBody: TipResponseBody = { ok: true };
      try {
        parsedBody = JSON.parse(text);
      } catch {
        /* non-JSON body — fall through with defaults */
      }

      const txHash = parsedBody.txHash ?? null;
      const recordedOnChain = parsedBody.recordedOnChain ?? null;

      setStatus({
        kind: "success",
        data: { amount: finalAmount, txHash, recordedOnChain },
      });
      // Clear the inputs so "Send another" starts from a clean slate.
      setMessage("");
      setCustomAmount("");
      setSelectedAmount("1.00");
      toast.success(`Sent $${finalAmount} USDC to ${displayName}`, {
        description: txHash ? "Tap to view on Stellar Expert." : undefined,
        action: txHash
          ? {
              label: "View tx",
              onClick: () => window.open(stellarExpertTxUrl(txHash), "_blank"),
            }
          : undefined,
      });
      refreshBalances();
      dispatchTipSent(slug);
    } catch (err) {
      const errMsg = (err as Error).message ?? "Unknown error";
      setStatus({ kind: "error", message: errMsg });
      toast.error(errMsg);
    }
  }

  if (!hasUsdcTrustline) {
    return (
      <Card padding="lg">
        <h2 className="font-display text-2xl mb-2">Send a tip</h2>
        <div className="mt-4 p-4 rounded-md border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 text-sm space-y-2">
          <p className="font-medium text-[var(--color-ink)]">
            USDC trustline required
          </p>
          <p className="text-[var(--color-ink-soft)]">
            Your wallet needs a USDC trustline to send tips. Open Freighter →
            Manage Assets → Add USDC, then refresh.
          </p>
          <button
            type="button"
            onClick={refreshBalances}
            className="text-[var(--color-accent)] underline text-sm"
          >
            Refresh balance
          </button>
        </div>
      </Card>
    );
  }

  if (status.kind === "success") {
    const { amount, txHash, recordedOnChain } = status.data;
    return (
      <Card padding="lg">
        <div className="text-center space-y-3">
          <div className="flex justify-center text-[var(--color-accent)]">
            <SparkleGlyph size={40} />
          </div>
          <h2 className="font-display text-3xl text-[var(--color-success)]">
            Tip sent
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)]">
            ${amount} USDC is on its way to {displayName}.
          </p>
          {txHash && (
            <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
              <p className="text-xs uppercase tracking-wider text-[var(--color-ink-muted)]">
                Payment transaction
              </p>
              <a
                href={stellarExpertTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-mono text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] break-all underline"
              >
                {txHash}
              </a>
            </div>
          )}
          {recordedOnChain === false && (
            <p className="text-xs text-[var(--color-warn)]">
              Payment settled, but the on-chain note write failed — it may take
              a moment to appear on the wall.
            </p>
          )}
          <button
            type="button"
            onClick={() => setStatus({ kind: "idle" })}
            className="text-sm text-[var(--color-accent)] underline mt-2"
          >
            Send another
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="relative overflow-hidden">
      {busy && (
        <div
          className="absolute top-0 left-0 h-[2px] bg-[var(--color-accent)] animate-[tipProgress_2s_ease-in-out_infinite]"
          aria-hidden="true"
        />
      )}
      <form
        onSubmit={handleSubmit}
        className={`space-y-6 transition-opacity duration-200 ${busy ? "opacity-70" : ""}`}
      >
        <div>
          <h2 className="font-display text-2xl">Send a tip to {displayName}</h2>
          <p className="text-xs text-[var(--color-ink-muted)] mt-1">
            USDC on Stellar Testnet · 0% fee · ~5s settlement
          </p>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-3">
            Select amount
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {PRESET_AMOUNTS.map((amt) => {
              const active =
                customAmount.trim() === "" && selectedAmount === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSelectedAmount(amt);
                    setCustomAmount("");
                  }}
                  className={`h-12 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)] border border-[var(--color-accent)]"
                      : "bg-[var(--color-surface-sunken)] border border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-border-strong)]"
                  }`}
                >
                  ${amt}
                </button>
              );
            })}
          </div>
          <input
            type="number"
            step="0.01"
            min={MIN_TIP_AMOUNT}
            max={MAX_TIP_AMOUNT}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="Or enter a custom amount…"
            disabled={busy}
            className="w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors font-mono text-sm disabled:opacity-60"
          />
        </div>

        <div>
          <label
            htmlFor="message"
            className="block text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-2"
          >
            Your message{" "}
            <span className="text-[var(--color-ink-muted)] normal-case tracking-normal">
              (optional, on-chain)
            </span>
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Leave a note on the tipping wall…"
            maxLength={TIP_MESSAGE_MAX}
            rows={3}
            disabled={busy}
            className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors text-sm resize-none disabled:opacity-60"
          />
          <p className="text-xs text-[var(--color-ink-muted)] mt-1 text-right font-mono">
            {message.length}/{TIP_MESSAGE_MAX}
          </p>
        </div>

        <Button
          type="submit"
          disabled={busy}
          variant="primary"
          size="lg"
          fullWidth
        >
          {status.kind === "busy" ? (
            <>
              <Spinner size={16} />
              {status.label}
            </>
          ) : (
            `Tip $${finalAmount} USDC`
          )}
        </Button>

        {status.kind === "error" && (
          <div className="text-sm text-[var(--color-error)] break-words">
            {status.message}
          </div>
        )}

        <p className="text-xs text-[var(--color-ink-muted)] text-center">
          You'll sign the payment in Freighter. Nothing is sent until you
          confirm.
        </p>
      </form>
    </Card>
  );
}
