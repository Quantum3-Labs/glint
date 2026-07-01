"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCreatorProfile } from "@/components/creator/dashboard/useCreatorProfile";
import { useWalletStore } from "@/stores/wallet";

/**
 * Header nav links with the active route emphasized. Client component (needs
 * `usePathname` + wallet state), kept separate so the rest of the header stays
 * server-rendered.
 *
 * Once the connected wallet owns a profile, "Create" is swapped for a "My page"
 * shortcut to that profile — otherwise reaching your own page means detouring
 * through the dashboard.
 */
export function HeaderNav() {
  const pathname = usePathname();
  const address = useWalletStore((s) => s.address);
  const { state } = useCreatorProfile(address);
  const mySlug = state.kind === "loaded" ? state.creator.slug : null;

  const links = [
    { href: "/browse", label: "Browse" },
    mySlug
      ? { href: `/${mySlug}`, label: "My page" }
      : { href: "/create", label: "Create" },
    { href: "/dashboard", label: "Dashboard" },
  ];

  return (
    <nav className="hidden sm:flex items-center gap-8 text-sm">
      {links.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`transition-colors ${
              active
                ? "text-[var(--color-ink)] font-medium"
                : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
