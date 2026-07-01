import Link from "next/link";
import { SparkleGlyph } from "@/components/ui/EmptyState";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { HeaderNav } from "./HeaderNav";

/**
 * Global site header — wordmark on the left, nav in the middle,
 * wallet connect pill on the right.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-[var(--color-bg)]/90 backdrop-blur-sm border-b border-[var(--color-border)]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-[var(--color-ink)] hover:opacity-80 transition-opacity"
        >
          <span className="text-[var(--color-accent)]">
            <SparkleGlyph size={18} />
          </span>
          <span className="font-display text-2xl tracking-tight">glint</span>
        </Link>

        <HeaderNav />

        <ConnectButton />
      </div>
    </header>
  );
}
