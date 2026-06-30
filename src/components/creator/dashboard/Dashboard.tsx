"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, UserIcon, WalletIcon } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WalletBalances } from "@/components/wallet/WalletBalances";
import { useWalletStore } from "@/stores/wallet";
import { EditProfileForm } from "./EditProfileForm";
import { PatronageAdmin } from "./PatronageAdmin";
import { StatsCards } from "./StatsCards";
import { TippingLinkCard } from "./TippingLinkCard";
import { useCreatorProfile } from "./useCreatorProfile";

export function Dashboard() {
  const address = useWalletStore((s) => s.address);
  const { state, updateProfile } = useCreatorProfile(address);

  if (!address) {
    return (
      <EmptyState
        icon={<WalletIcon />}
        title="Wallet not connected"
        description="Connect your Freighter wallet to see your dashboard, tipping link, and edit your profile."
      />
    );
  }

  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div className="space-y-6">
        <Card>
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-10 w-full" />
        </Card>
        <Card>
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-10 w-full mb-3" />
          <Skeleton className="h-24 w-full mb-3" />
          <Skeleton className="h-10 w-32" />
        </Card>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="text-sm text-[var(--color-error)]">
        Error: {state.message}
      </div>
    );
  }

  if (state.kind === "no-profile") {
    return (
      <EmptyState
        icon={<UserIcon />}
        title="No profile yet"
        description="Pick a handle, add a display name, and start receiving USDC tips in seconds."
        action={
          <Link href="/create">
            <Button variant="primary">Create profile</Button>
          </Link>
        }
      />
    );
  }

  const { creator } = state;

  return (
    <div className="space-y-6">
      <StatsCards slug={creator.slug} />
      <TippingLinkCard slug={creator.slug} />
      <EditProfileForm
        creator={creator}
        onSave={async (updates) => updateProfile(creator.slug, updates)}
      />
      <PatronageAdmin
        slug={creator.slug}
        walletAddress={creator.walletAddress}
      />
      <WalletBalances />
    </div>
  );
}
