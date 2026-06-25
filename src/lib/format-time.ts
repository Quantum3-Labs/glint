/**
 * Human-friendly relative time from a unix-seconds timestamp (as a string,
 * since on-chain values arrive as stringified bigints). Falls back to a short
 * date past a week. Shared by the tipping wall and the anonymous wall.
 */
export function formatRelativeTime(timestamp: string): string {
  const ms = Number(BigInt(timestamp)) * 1000;
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
