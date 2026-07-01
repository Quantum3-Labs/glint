"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/browse", label: "Browse" },
  { href: "/create", label: "Create" },
  { href: "/dashboard", label: "Dashboard" },
];

/**
 * Header nav links with the active route emphasized. Client component (needs
 * `usePathname`), kept separate so the rest of the header stays server-rendered.
 */
export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden sm:flex items-center gap-8 text-sm">
      {NAV_LINKS.map((link) => {
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
