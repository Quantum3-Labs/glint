/**
 * Map raw errors (server strings, contract error codes, bb.js/proof failures,
 * network errors) to friendly, user-facing messages. Never leak raw technical
 * text to the toast.
 */

const RULES: Array<{ test: RegExp; message: string }> = [
  {
    // path route: commitment not on-chain yet
    test: /not found in pool|not.*settled|UnknownRoot|#6/i,
    message:
      "Your tip is still settling on-chain. Wait a few seconds and try again.",
  },
  {
    // contract #5: nullifier already spent
    test: /nullifier|already.*post|#5/i,
    message: "You've already posted from this tip.",
  },
  {
    // contract #7 / #10: proof or message binding rejected
    test: /verification|verify|proof|message.*hash|#7|#10/i,
    message: "Couldn't verify the proof. Please try again.",
  },
  {
    test: /network|fetch|timeout|ECONN|ETIMEDOUT|Failed to fetch/i,
    message: "Network problem. Check your connection and try again.",
  },
];

export function friendlyError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? "");
  for (const { test, message } of RULES) {
    if (test.test(text)) return message;
  }
  return "Couldn't post your message. Please try again.";
}
