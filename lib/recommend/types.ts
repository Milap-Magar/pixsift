// The shared contract every recommender implements.
//
// Keeping this tiny is the whole point: a recommender is just a pure function
// from "here's the world" to "here's a ranked list". No I/O, no imports from
// the app, no surprises — which makes each one trivial to test in isolation.

import type { Pin } from "@/lib/pins";

export type ScoredPin = {
  pin: Pin;
  /** Higher is better. Not comparable ACROSS algorithms — only within one run. */
  score: number;
  /** Human-readable "why". Shown under the suggestion, and priceless when debugging. */
  reason: string;
};

export type RecommendationInput = {
  /** The pin being viewed. */
  subject: Pin;
  /** Every other pin — the subject is already excluded. */
  candidates: Pin[];
  /**
   * The whole favourites matrix: userId -> the pin ids that user saved.
   * This is the raw material for collaborative filtering.
   */
  favoriteSets: Map<string, Set<string>>;
  /** Passed in rather than read from the clock, so results are reproducible in tests. */
  now: number;
};

export type Recommender = (input: RecommendationInput) => ScoredPin[];
