import { BrowseCreators } from "@/components/creator/BrowseCreators";
import { PageShell } from "@/components/layout/PageShell";

export const metadata = {
  title: "Browse creators · glint",
};

export default function BrowsePage() {
  return (
    <PageShell maxWidth="5xl">
      <div className="mb-10 max-w-4xl">
        <h1 className="font-display text-5xl mb-3">Browse creators</h1>
        <p className="text-[var(--color-ink-soft)]">
          Discover folks on glint and send them a tip. Every creator here
          receives USDC directly — no middlemen.
        </p>
      </div>
      <BrowseCreators />
    </PageShell>
  );
}
