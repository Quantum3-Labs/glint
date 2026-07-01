"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, WalletIcon } from "@/components/ui/EmptyState";
import { API_ENDPOINTS, ApiError, apiClient } from "@/lib/api";
import { BIO_MAX, DISPLAY_NAME_MAX } from "@/lib/creators/limits";
import type { Creator } from "@/lib/creators/types";
import { type FormStatus, isBusy } from "@/lib/form-status";
import { shortenAddress } from "@/lib/stellar";
import { useWalletStore } from "@/stores/wallet";
import { useCreatorProfile } from "./dashboard/useCreatorProfile";

const LABEL_CLASSES =
  "block text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-2";
const INPUT_CLASSES =
  "w-full h-11 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-60";
const TEXTAREA_CLASSES =
  "w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-none disabled:opacity-60";

export function CreateProfileForm() {
  const router = useRouter();
  const address = useWalletStore((s) => s.address);

  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [github, setGithub] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<FormStatus<Creator>>({ kind: "idle" });

  // Real host (e.g. `localhost:3000`, `glint-xyz.run.app`) so the handle
  // preview and success link match wherever the app is actually deployed.
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => {
    setHost(window.location.host);
  }, []);

  // A wallet can only own one profile — if this one already has one, send them
  // to it instead of letting them fill a form that will 409 on submit.
  const { state: profileState } = useCreatorProfile(address);

  if (!address) {
    return (
      <EmptyState
        icon={<WalletIcon />}
        title="Connect your wallet"
        description="Connect Freighter to pick a handle and start receiving tips. Your wallet address is your identity."
      />
    );
  }

  if (profileState.kind === "loading") {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--color-ink-muted)]">
          Checking your wallet…
        </p>
      </Card>
    );
  }

  if (profileState.kind === "loaded") {
    const existing = profileState.creator;
    return (
      <Card padding="lg">
        <h2 className="font-display text-2xl mb-2">
          You already have a profile
        </h2>
        <p className="text-sm text-[var(--color-ink-soft)] mb-1">
          This wallet ({shortenAddress(address, 4, 4)}) owns{" "}
          <span className="font-mono">@{existing.slug}</span>. One wallet, one
          profile.
        </p>
        <div className="flex gap-3 mt-5">
          <Link href={`/${existing.slug}`}>
            <Button variant="primary">View your page</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="secondary">Go to dashboard</Button>
          </Link>
        </div>
      </Card>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!address) return;

    setStatus({ kind: "busy", label: "Creating…" });

    try {
      const { data } = await apiClient.post<Creator>(API_ENDPOINTS.CREATORS, {
        slug: slug.trim(),
        walletAddress: address,
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        twitter: twitter.trim() || undefined,
        github: github.trim() || undefined,
        website: website.trim() || undefined,
      });

      setStatus({ kind: "success", data });
      toast.success(`Profile @${data.slug} created`);
      setTimeout(() => {
        router.push(`/${data.slug}`);
      }, 1500);
    } catch (err) {
      const errMsg =
        err instanceof ApiError
          ? err.message
          : ((err as Error).message ?? "Network error");
      setStatus({ kind: "error", message: errMsg });
      toast.error(errMsg);
    }
  }

  if (status.kind === "success") {
    return (
      <Card padding="lg">
        <h2 className="font-display text-2xl mb-3 text-[var(--color-success)]">
          Profile created
        </h2>
        <p className="text-sm text-[var(--color-ink-soft)] mb-2">
          Your tipping link is live:
        </p>
        <Link
          href={`/${status.data.slug}`}
          className="font-mono text-lg text-[var(--color-ink)] underline break-all"
        >
          {host ?? "…"}/{status.data.slug}
        </Link>
        <p className="text-xs text-[var(--color-ink-muted)] mt-4">
          Redirecting to your public page…
        </p>
      </Card>
    );
  }

  const isSubmitting = isBusy(status);

  return (
    <Card padding="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="slug" className={LABEL_CLASSES}>
            Handle <span className="text-[var(--color-error)]">*</span>
          </label>
          <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] focus-within:border-[var(--color-accent)] transition-colors">
            <span
              className="pl-3 pr-1 text-sm text-[var(--color-ink-muted)] font-mono max-w-[50%] truncate shrink-0"
              title={host ?? undefined}
            >
              {host ?? "…"}/
            </span>
            <input
              id="slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="alice"
              required
              pattern="[a-z0-9_-]{3,20}"
              title="3-20 lowercase letters, digits, dashes or underscores"
              disabled={isSubmitting}
              className="flex-1 h-11 px-1 bg-transparent text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none font-mono text-sm disabled:opacity-60"
            />
          </div>
          <p className="text-xs text-[var(--color-ink-muted)] mt-2">
            3–20 characters. Lowercase letters, digits, dashes, underscores.
          </p>
        </div>

        <div>
          <label htmlFor="displayName" className={LABEL_CLASSES}>
            Display name <span className="text-[var(--color-error)]">*</span>
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Alice Chen"
            required
            maxLength={DISPLAY_NAME_MAX}
            disabled={isSubmitting}
            className={INPUT_CLASSES}
          />
        </div>

        <div>
          <label htmlFor="bio" className={LABEL_CLASSES}>
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="What you do, why people should tip you…"
            maxLength={BIO_MAX}
            rows={3}
            disabled={isSubmitting}
            className={TEXTAREA_CLASSES}
          />
          <p className="text-xs text-[var(--color-ink-muted)] mt-1 text-right font-mono">
            {bio.length}/{BIO_MAX}
          </p>
        </div>

        <div className="pt-2 border-t border-[var(--color-border)] space-y-5">
          <p className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
            Links (optional)
          </p>

          <div>
            <label htmlFor="twitter" className={LABEL_CLASSES}>
              Twitter / X
            </label>
            <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] focus-within:border-[var(--color-accent)] transition-colors">
              <span className="pl-3 pr-1 text-sm text-[var(--color-ink-muted)] font-mono">
                @
              </span>
              <input
                id="twitter"
                type="text"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value.replace(/^@/, ""))}
                placeholder="alicechen"
                maxLength={16}
                disabled={isSubmitting}
                className="flex-1 h-11 px-1 bg-transparent text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none font-mono text-sm disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label htmlFor="github" className={LABEL_CLASSES}>
              GitHub
            </label>
            <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] focus-within:border-[var(--color-accent)] transition-colors">
              <span className="pl-3 pr-1 text-sm text-[var(--color-ink-muted)] font-mono">
                github.com/
              </span>
              <input
                id="github"
                type="text"
                value={github}
                onChange={(e) => setGithub(e.target.value.replace(/^@/, ""))}
                placeholder="alicechen"
                maxLength={40}
                disabled={isSubmitting}
                className="flex-1 h-11 px-1 bg-transparent text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none font-mono text-sm disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label htmlFor="website" className={LABEL_CLASSES}>
              Website
            </label>
            <input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://alice.dev"
              maxLength={200}
              disabled={isSubmitting}
              className={INPUT_CLASSES}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-ink-muted)] mb-4">
            Tips will be sent to{" "}
            <span className="font-mono text-[var(--color-ink-soft)]">
              {shortenAddress(address, 6, 6)}
            </span>
          </div>
          <Button
            type="submit"
            disabled={isSubmitting}
            variant="primary"
            size="lg"
            fullWidth
          >
            {status.kind === "busy" ? status.label : "Create profile"}
          </Button>
        </div>

        {status.kind === "error" && (
          <div className="text-sm text-[var(--color-error)] break-words">
            {status.message}
          </div>
        )}
      </form>
    </Card>
  );
}
