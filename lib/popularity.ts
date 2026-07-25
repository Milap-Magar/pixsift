// ── Popularity ranking ──────────────────────────────────────────────────────
//
// Powers /most-popular. Kept out of the page for two reasons: reading the clock
// inside a component body is impure (React's lint rules will tell you so), and
// ranking logic is much easier to test as a plain function.
//
// "Popular" is a choice, not a fact. The choice here is that a save counts for
// three times a comment — saving is a deliberate "I want this again", while
// commenting is often just passing through. Change the weights below and the
// page follows.

import { countComments } from "./comments";
import { getFavoriteCount, getPins, type Pin } from "./pins";

export const SAVE_WEIGHT = 3;
export const COMMENT_WEIGHT = 1;

const DAY = 24 * 60 * 60 * 1000;

export const POPULARITY_WINDOWS = [
  { key: "week", label: "This week", days: 7 },
  { key: "month", label: "This month", days: 30 },
  { key: "all", label: "All time", days: Infinity },
] as const;

export type PopularityWindow = (typeof POPULARITY_WINDOWS)[number]["key"];

export function isPopularityWindow(value: unknown): value is PopularityWindow {
  return POPULARITY_WINDOWS.some((w) => w.key === value);
}

export type RankedPin = {
  pin: Pin;
  rank: number;
  saves: number;
  comments: number;
  score: number;
};

/**
 * Every pin in the window, best first.
 *
 * NOTE ON THE WINDOW: it filters on when a pin was *posted*, not when each save
 * happened, because the favourites store keeps no timestamps. A true "most saved
 * this week" needs `{ userId, pinId, savedAt }` rows first. The page says so
 * out loud rather than quietly implying otherwise.
 */
export function rankByPopularity(
  window: PopularityWindow = "all",
  now: number = Date.now(),
): RankedPin[] {
  const days = POPULARITY_WINDOWS.find((w) => w.key === window)?.days ?? Infinity;
  const cutoff = days === Infinity ? -Infinity : now - days * DAY;

  return getPins()
    .filter((pin) => pin.createdAt >= cutoff)
    .map((pin) => {
      const saves = getFavoriteCount(pin.id);
      const comments = countComments(pin.id);
      return {
        pin,
        saves,
        comments,
        score: saves * SAVE_WEIGHT + comments * COMMENT_WEIGHT,
        rank: 0,
      };
    })
    // Ties break on recency, so the order is stable rather than arbitrary.
    .sort((a, b) => b.score - a.score || b.pin.createdAt - a.pin.createdAt)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
