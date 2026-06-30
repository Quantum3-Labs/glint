"use client";

import { useState } from "react";
import { PatronagePolls } from "@/components/creator/PatronagePolls";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { TIER_ORDER, TIERS, type TierKey } from "@/lib/patronage/fields";
import { type NoteState, usePatronage } from "@/lib/patronage/use-patronage";
import { useWalletStore } from "@/stores/wallet";

const MESSAGE_MAX = 280;

const TIER_OPTIONS: { key: TierKey; label: string; amount: bigint }[] =
  TIER_ORDER.map((key) => ({ key, label: `$${key}`, amount: TIERS[key] }));

function dollars(stroops: string | bigint): string {
  return `$${Number(BigInt(stroops)) / 1e7}`;
}

function ShieldIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/**
 * The supporter-facing private patronage panel: deposit a fixed tier into the
 * pool, then take anonymous actions (private payment, message, vote) off the
 * resulting note. All crypto + relay lives in `usePatronage`.
 */
export function PrivatePatronage({
  slug,
  creatorWallet,
}: {
  slug: string;
  creatorWallet: string;
}) {
  const address = useWalletStore((s) => s.address);
  const { notes, busy, deposit, withdraw, postMessage, vote } = usePatronage(
    slug,
    creatorWallet,
  );
  const [tier, setTier] = useState<TierKey>("5");

  return (
    <div className="space-y-6">
      {/* Deposit */}
      <Card padding="lg" className="border-l-2 border-[var(--color-accent)]">
        <div className="flex items-center gap-2 text-[var(--color-accent)] mb-1">
          <ShieldIcon />
          <h2 className="font-display text-2xl text-[var(--color-ink)]">
            Support privately
          </h2>
        </div>
        <p className="text-xs text-[var(--color-ink-muted)] mb-4">
          Deposit a fixed amount into the pool. Later you can pay the creator,
          message, or vote — none of it linkable to your wallet.
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
          {TIER_OPTIONS.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={!!busy}
              onClick={() => setTier(t.key)}
              className={`h-12 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                tier === t.key
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)] border border-[var(--color-accent)]"
                  : "bg-[var(--color-surface-sunken)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          disabled={!!busy || !address}
          variant="primary"
          size="lg"
          fullWidth
          onClick={() => deposit(TIERS[tier])}
        >
          {busy ? (
            <>
              <Spinner size={16} />
              {busy}
            </>
          ) : address ? (
            `Deposit ${TIER_OPTIONS.find((t) => t.key === tier)?.label} USDC privately`
          ) : (
            "Connect wallet to deposit"
          )}
        </Button>
      </Card>

      {/* Actions from notes */}
      {notes.length > 0 && (
        <Card padding="lg">
          <h3 className="font-display text-xl mb-3">Your private notes</h3>
          <ul className="space-y-4">
            {notes.map((n) => (
              <NoteActions
                key={n.commitmentHex}
                note={n}
                busy={busy}
                onWithdraw={() => withdraw(n)}
                onMessage={(msg) => postMessage(n, msg)}
              />
            ))}
          </ul>
        </Card>
      )}

      {/* Voting */}
      <PatronagePolls slug={slug} notes={notes} busy={busy} onVote={vote} />
    </div>
  );
}

function NoteActions({
  note,
  busy,
  onWithdraw,
  onMessage,
}: {
  note: NoteState;
  busy: string | null;
  onWithdraw: () => void;
  onMessage: (message: string) => Promise<boolean>;
}) {
  const [message, setMessage] = useState("");
  const [showMessage, setShowMessage] = useState(false);

  return (
    <li className="rounded-md border border-[var(--color-border)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {dollars(note.tier)} note ·{" "}
          <span className="text-xs text-[var(--color-ink-muted)] font-normal">
            verified {dollars(note.tier)} supporter
          </span>
        </span>
        <span className="text-xs text-[var(--color-ink-muted)]">
          {new Date(note.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      <div className="flex gap-2">
        {!note.withdrawSpent && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={!!busy}
            onClick={onWithdraw}
          >
            Send {dollars(note.tier)} to creator
          </Button>
        )}
        {!note.messageSpent && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={() => setShowMessage((v) => !v)}
          >
            {showMessage ? "Cancel message" : "Post a message"}
          </Button>
        )}
      </div>

      {showMessage && !note.messageSpent && (
        <div className="space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Say something as a verified anonymous supporter…"
            maxLength={MESSAGE_MAX}
            rows={2}
            disabled={!!busy}
            className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-sm resize-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-ink-muted)] font-mono">
              {message.length}/{MESSAGE_MAX}
            </span>
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={!!busy || message.trim().length === 0}
              onClick={async () => {
                if (await onMessage(message.trim())) {
                  setMessage("");
                  setShowMessage(false);
                }
              }}
            >
              Post anonymously
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Shown when the supporter has no notes yet (kept for parity / future use). */
export function NoNotes() {
  return (
    <EmptyState
      title="Deposit first to unlock"
      description="A private deposit gives you a note that lets you support, message, or vote anonymously."
      className="border-none p-0 bg-transparent"
    />
  );
}
