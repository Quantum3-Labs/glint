"use client";

import { Button } from "@/components/ui/Button";
import { useWalletStore } from "@/stores/wallet";
import { WalletMenu } from "./WalletMenu";

export function ConnectButton() {
  const address = useWalletStore((s) => s.address);
  const isConnecting = useWalletStore((s) => s.isConnecting);
  const error = useWalletStore((s) => s.error);
  const connect = useWalletStore((s) => s.connect);

  if (address) {
    return <WalletMenu />;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        onClick={connect}
        disabled={isConnecting}
        variant="primary"
        size="md"
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </Button>
      {error && (
        <span className="text-[var(--color-error)] text-xs max-w-xs text-right">
          {error}
        </span>
      )}
    </div>
  );
}
