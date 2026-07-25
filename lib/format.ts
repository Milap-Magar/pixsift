const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * "just now" / "3 minutes ago" / "2 days ago".
 *
 * This depends on the current clock, so server and client render it slightly
 * differently — every element using it needs `suppressHydrationWarning`.
 */
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const elapsed = timestamp - now;
  const magnitude = Math.abs(elapsed);

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (magnitude >= ms) return relative.format(Math.round(elapsed / ms), unit);
  }

  return "just now";
}
