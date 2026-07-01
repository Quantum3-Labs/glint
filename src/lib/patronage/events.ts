/**
 * Cross-component event so the Activity wall can refetch after a supporter
 * posts an anonymous message, without lifting state across sibling components.
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

/** Fired when the creator opens a new poll, so the Polls list can refetch. */
export const PATRONAGE_POLL_CREATED_EVENT = "glint:patronage-poll-created";

export function dispatchPollCreated(slug: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PatronagePostedDetail>(PATRONAGE_POLL_CREATED_EVENT, {
      detail: { slug },
    }),
  );
}

/** Fired after any relayed action (payment/message/vote) so the Activity wall
 * can refetch. */
export const PATRONAGE_ACTIVITY_EVENT = "glint:patronage-activity";

export function dispatchActivity(slug: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PatronagePostedDetail>(PATRONAGE_ACTIVITY_EVENT, {
      detail: { slug },
    }),
  );
}
