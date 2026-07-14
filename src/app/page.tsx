import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SparkleGlyph } from "@/components/ui/EmptyState";
import { InitialAvatar } from "@/components/ui/InitialAvatar";
import { getCreatorsStore } from "@/lib/creators";

const PRIVACY_STEPS = [
  {
    n: "01",
    title: "Deposit once",
    body: "Sign a single deposit into the shared pool. Fixed tiers ($0.1 – $100) make every deposit look the same.",
  },
  {
    n: "02",
    title: "Act with no wallet",
    body: "Prove in your browser that a deposit in the tree is yours. The server relays it — your wallet never signs, never appears.",
  },
  {
    n: "03",
    title: "Verify on-chain",
    body: "Every anonymous action links to its Stellar tx. The tx source is the relayer, not you — the unlinkability is public.",
  },
];

const ANON_ACTIONS = [
  {
    title: "Pay the creator",
    body: "The pool pays out. The payment is unlinkable to your deposit.",
  },
  {
    title: "Post a message",
    body: 'Appears on the wall as a verified "$X supporter" — no wallet attached.',
  },
  {
    title: "Vote in a poll",
    body: "Stake-weighted by your tier. One vote per poll, per deposit.",
  },
];

const STATS = [
  { big: "1 deposit", label: "Unlocks 3 anonymous actions" },
  { big: "0 signatures", label: "Needed to pay, post, or vote" },
  { big: "On-chain", label: "Every action provably verified" },
];

export default async function Home() {
  const { creators } = await getCreatorsStore().list({ limit: 6, offset: 0 });

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)] flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-24">
          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-12 items-start">
            <div className="space-y-8">
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight">
                Back creators without{" "}
                <span className="text-[var(--color-accent)]">
                  revealing who you are
                </span>
                .
              </h1>
              <p className="text-lg text-[var(--color-ink-soft)] max-w-xl leading-relaxed">
                Glint is a USDC tipping dApp on Stellar with a zero-knowledge
                privacy layer. One private deposit lets you pay, message, and
                vote for a creator — anonymously, with every action still
                provable on-chain. Or tip publicly in five seconds. Zero
                platform fees either way.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/browse">
                  <Button variant="primary" size="lg">
                    Support a creator
                  </Button>
                </Link>
                <Link href="/create">
                  <Button variant="secondary" size="lg">
                    Create your profile
                  </Button>
                </Link>
              </div>
            </div>

            <MockAnonymousReceipt />
          </div>
        </section>

        {/* Stat strip */}
        <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]/60">
          <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:divide-x divide-[var(--color-border)]">
            {STATS.map((s) => (
              <div key={s.label} className="sm:px-8 first:sm:pl-0">
                <div className="font-display text-4xl text-[var(--color-ink)]">
                  {s.big}
                </div>
                <div className="text-sm text-[var(--color-ink-soft)] mt-1">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Two ways to support — mirrors the tabs on a creator's profile */}
        <section className="max-w-6xl mx-auto px-6 py-24">
          <div className="mb-12 max-w-2xl">
            <h2 className="font-display text-4xl leading-tight mb-3">
              Two ways to support
            </h2>
            <p className="text-[var(--color-ink-soft)]">
              Same creator, same USDC. One flow shows your wallet, the other
              proves nothing but that you paid.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card padding="lg" className="h-full">
              <div className="font-mono text-xs text-[var(--color-ink-muted)] uppercase tracking-wider mb-4">
                Public
              </div>
              <h3 className="font-display text-2xl mb-3">Tip publicly</h3>
              <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-5">
                An x402 USDC tip with a note on the public wall. Your wallet
                signs, your address is on the receipt, and it settles in about
                five seconds. Works for humans in a browser and for AI agents
                over plain HTTP.
              </p>
              <ul className="space-y-2 text-sm text-[var(--color-ink-soft)]">
                <li>Wallet address visible on the wall</li>
                <li>Instant, one signature</li>
                <li>Zero platform fee — tips go 1:1</li>
              </ul>
            </Card>

            <Card
              padding="lg"
              className="h-full border-[var(--color-border-strong)]"
            >
              <div className="font-mono text-xs text-[var(--color-accent)] uppercase tracking-wider mb-4">
                Zero-knowledge
              </div>
              <h3 className="font-display text-2xl mb-3">Support privately</h3>
              <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-5">
                Deposit into a shared pool once, then take several anonymous
                actions that no one can link back to your wallet — or to each
                other. A Noir circuit proves your deposit is in the pool without
                revealing which one it is.
              </p>
              <div className="space-y-4">
                {ANON_ACTIONS.map((a) => (
                  <div key={a.title}>
                    <div className="text-sm font-medium">{a.title}</div>
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      {a.body}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        {/* How the privacy works */}
        <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]/60">
          <div className="max-w-6xl mx-auto px-6 py-24">
            <div className="mb-12 max-w-2xl">
              <h2 className="font-display text-4xl leading-tight mb-3">
                How the privacy works
              </h2>
              <p className="text-[var(--color-ink-soft)]">
                Your wallet signs exactly once — the deposit. Everything after
                that carries a proof instead of a signature.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-12">
              {PRIVACY_STEPS.map((step) => (
                <div key={step.n} className="space-y-3">
                  <div className="font-display text-3xl text-[var(--color-accent)]">
                    {step.n}
                  </div>
                  <h3 className="font-display text-xl">{step.title}</h3>
                  <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>

            <Card sunken padding="lg">
              <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
                Under the hood it is the classic privacy-pool pattern.
                Depositing adds a{" "}
                <span className="font-mono text-[var(--color-ink)]">
                  Poseidon
                </span>{" "}
                commitment to the Merkle tree for your tier. Acting proves
                membership of that tree and burns a single-use, domain-separated{" "}
                <span className="font-mono text-[var(--color-ink)]">
                  nullifier
                </span>
                , so one deposit can pay once, message once, and vote once per
                poll — each with a different nullifier, so even your own actions
                can't be linked to each other. Proving runs entirely in the
                browser; the server only relays.
              </p>
            </Card>
          </div>
        </section>

        {/* For creators */}
        <section className="max-w-6xl mx-auto px-6 py-24">
          <div className="grid lg:grid-cols-[1fr_1fr] gap-12 items-center">
            <div className="space-y-4">
              <h2 className="font-display text-4xl leading-tight">
                For creators: no setup
              </h2>
              <p className="text-[var(--color-ink-soft)] leading-relaxed">
                Pick a handle, connect Freighter, and share the link. Public
                tips land in your wallet in seconds. Private payments need
                nothing from you at all — the supporter binds you as the
                recipient inside their proof, so the relayer can't redirect the
                funds and you don't have to register for anything.
              </p>
              <p className="text-[var(--color-ink-soft)] leading-relaxed">
                No KYC, no onboarding funnel, no premium tier, no platform fee.
              </p>
              <div className="pt-2">
                <Link href="/create">
                  <Button variant="primary" size="lg">
                    Claim your handle
                  </Button>
                </Link>
              </div>
            </div>

            <Card padding="lg">
              <div className="font-mono text-xs text-[var(--color-ink-muted)] uppercase tracking-wider mb-4">
                Your profile
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <span>Public tip wall</span>
                  <span className="text-[var(--color-ink-muted)]">
                    wallet + note
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-[var(--color-border)] pt-3">
                  <span>Anonymous activity wall</span>
                  <span className="text-[var(--color-ink-muted)]">
                    proof + tx hash
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-[var(--color-border)] pt-3">
                  <span>Stake-weighted polls</span>
                  <span className="text-[var(--color-ink-muted)]">
                    you open, they vote
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Featured creators */}
        {creators.length > 0 && (
          <section className="max-w-6xl mx-auto px-6 pb-24">
            <div className="flex items-end justify-between mb-8">
              <h2 className="font-display text-3xl">Some folks on glint</h2>
              <Link
                href="/browse"
                className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition-colors"
              >
                Browse all →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {creators.slice(0, 6).map((c) => (
                <Link key={c.slug} href={`/${c.slug}`} className="block">
                  <Card className="hover:border-[var(--color-border-strong)] transition-colors h-full">
                    <div className="flex items-center gap-3 mb-3">
                      <InitialAvatar name={c.displayName} />
                      <div className="min-w-0">
                        <div className="font-display text-lg truncate">
                          {c.displayName}
                        </div>
                        <div className="text-xs font-mono text-[var(--color-ink-muted)] truncate">
                          @{c.slug}
                        </div>
                      </div>
                    </div>
                    {c.bio && (
                      <p className="text-sm text-[var(--color-ink-soft)] line-clamp-2">
                        {c.bio}
                      </p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/60">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-[var(--color-accent)]">
                <SparkleGlyph size={18} />
              </span>
              <span className="font-display text-2xl">glint</span>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Built for the Stellar hackathon 2026 · USDC on Stellar Testnet ·
              x402 payment protocol · Noir + UltraHonk on Soroban
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

/**
 * Decorative hero prop — a mock receipt for an anonymous payment out of the
 * pool. It deliberately shows no sender: that absence is the product.
 * Purely static; not wired to any data.
 */
function MockAnonymousReceipt() {
  return (
    <div className="hidden lg:block relative">
      <div className="absolute -top-4 -left-4 w-full h-full bg-[var(--color-surface-sunken)] border border-[var(--color-border)] rounded-lg" />
      <Card className="relative" padding="lg">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[var(--color-accent)]">
            <SparkleGlyph size={14} />
          </span>
          <span className="font-mono text-xs text-[var(--color-ink-muted)]">
            anonymous support · stellar:testnet
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-xs text-[var(--color-ink-muted)] uppercase tracking-wider mb-2">
              From
            </div>
            <div className="font-mono text-sm text-[var(--color-ink-muted)]">
              unknown — proof only
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--color-ink-muted)] uppercase tracking-wider mb-2">
              Amount
            </div>
            <div className="font-display text-4xl">
              +$5.00{" "}
              <span className="text-[var(--color-ink-muted)] text-2xl">
                USDC
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)]">
            <div className="text-xs text-[var(--color-ink-muted)] uppercase tracking-wider mb-2">
              Note
            </div>
            <p className="text-sm italic text-[var(--color-ink)]">
              "Loved your piece on Stellar contracts. Keep it coming."
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between text-xs text-[var(--color-ink-muted)]">
          <span>nullifier burned · unlinkable</span>
          <span className="font-mono">ledger #2847361</span>
        </div>
      </Card>
    </div>
  );
}
