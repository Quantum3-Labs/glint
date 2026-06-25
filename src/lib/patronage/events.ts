/**
 * Cross-component event so AnonWall can refetch after AnonPostForm posts an
 * anonymous message, without lifting state across sibling components.
 */

export const PATRONAGE_POSTED_EVENT = "glint:patronage-posted";

export type PatronagePostedDetail = { slug: string };

export function dispatchPatronagePosted(slug: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PatronagePostedDetail>(PATRONAGE_POSTED_EVENT, {
      detail: { slug },
    }),
  );
}
