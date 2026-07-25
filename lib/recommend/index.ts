// ── The recommender entry point ─────────────────────────────────────────────
//
// One import for the rest of the app: `relatedPins(pin, allPins)`.
//
// THREE ALGORITHMS ARE AVAILABLE. Switch between them without touching code:
//
//     # .env
//     RECOMMENDER=content-based    # words only — always works, never surprises
//     RECOMMENDER=collaborative    # co-saves only — surprising, needs data
//     RECOMMENDER=hybrid           # both + popularity + recency  (default)
//
// or per call: relatedPins(pin, all, { strategy: "collaborative" })
//
// Read docs/ALGORITHMS.md for how each one works and when to reach for it.
//
// TO ADD YOUR OWN:
//   1. write a file exporting a `Recommender` (see ./types.ts — it's one type)
//   2. add it to STRATEGIES below
//   3. set RECOMMENDER to its name
// Nothing else in the app changes.

import { getAllFavoriteSets, type Pin } from "@/lib/pins";

import { collaborative } from "./collaborative";
import { contentBased } from "./content-based";
import { hybrid } from "./hybrid";
import type { Recommender, ScoredPin } from "./types";

export type { Recommender, ScoredPin, RecommendationInput } from "./types";
export { contentBased } from "./content-based";
export { collaborative } from "./collaborative";
export { hybrid, makeHybrid, DEFAULT_WEIGHTS } from "./hybrid";

export const STRATEGIES = {
  "content-based": contentBased,
  collaborative,
  hybrid,
} satisfies Record<string, Recommender>;

export type StrategyName = keyof typeof STRATEGIES;

export const DEFAULT_STRATEGY: StrategyName = "hybrid";

function resolveStrategy(name?: StrategyName): Recommender {
  if (name && name in STRATEGIES) return STRATEGIES[name];

  const fromEnv = process.env.RECOMMENDER;
  if (fromEnv && fromEnv in STRATEGIES) return STRATEGIES[fromEnv as StrategyName];

  return STRATEGIES[DEFAULT_STRATEGY];
}

export type RelatedPinsOptions = {
  strategy?: StrategyName;
  limit?: number;
  /** Drop suggestions scoring at or below this. Keeps "More like this" honest. */
  minScore?: number;
  /** Injectable for tests, so results don't depend on the wall clock. */
  now?: number;
};

/**
 * Ranked suggestions for the pin being viewed.
 *
 * Synchronous today because every algorithm here is pure CPU work over
 * in-memory data. If yours needs I/O — a vector search, an embedding lookup,
 * a model call — make this `async`, and add `await` at its one call site in
 * app/pin/[id]/page.tsx. That page is a Server Component, so it can await freely.
 */
export function relatedPins(
  subject: Pin,
  all: Pin[],
  options: RelatedPinsOptions = {},
): ScoredPin[] {
  const { limit = 12, minScore = 0, now = Date.now() } = options;

  const candidates = all.filter((pin) => pin.id !== subject.id);
  if (candidates.length === 0) return [];

  const recommend = resolveStrategy(options.strategy);

  return recommend({ subject, candidates, favoriteSets: getAllFavoriteSets(), now })
    .filter((scored) => scored.score > minScore)
    .sort((a, b) => b.score - a.score || b.pin.createdAt - a.pin.createdAt)
    .slice(0, limit);
}
