// ══════════════════════════════════════════════════════════════════════════
//  ALGORITHM 3 — HYBRID  (weighted blend, with cold-start fallback)
// ══════════════════════════════════════════════════════════════════════════
//
//  Neither of the first two is enough on its own:
//    - content-based always works but is boring and repetitive
//    - collaborative is inspired but dies with no interaction data
//
//  So blend them, and add two signals neither one has:
//
//        final = w_content     · content
//              + w_collab      · collaborative
//              + w_popularity  · popularity
//              + w_recency     · recency
//
//  THE CRITICAL STEP IS NORMALISATION. Cosine lives in 0..1, Jaccard rarely
//  exceeds 0.3 in practice, and a raw save count could be 400. Adding those
//  directly means whichever happens to have the biggest numbers silently
//  becomes the only signal that matters. So every component is scaled to 0..1
//  against the best candidate in THIS run before any weight is applied.
//
//  Two more ideas worth understanding:
//
//  • Saturating popularity — favourites/(favourites + K) instead of raw count.
//    Going 0 -> 5 saves should matter far more than 400 -> 405. K is the point
//    of diminishing returns.
//
//  • Exponential recency decay — 0.5^(ageDays/halfLife). One number, easy to
//    reason about: at exactly `halfLife` days old, a pin scores 0.5.
//
//  COLD START: if no pin has any co-saves, the collaborative component is dead
//  weight — worse, it drags the blend toward noise. So we detect that and
//  redistribute its weight to content. This is why the app can ship with an
//  empty database and still recommend sensibly on day one.

import { contentBased } from "./content-based";
import { collaborative } from "./collaborative";
import type { RecommendationInput, ScoredPin } from "./types";

export type HybridWeights = {
  content: number;
  collaborative: number;
  popularity: number;
  recency: number;
};

export const DEFAULT_WEIGHTS: HybridWeights = {
  content: 0.45,
  collaborative: 0.35,
  popularity: 0.1,
  recency: 0.1,
};

/** Saves at which popularity is worth half its maximum. */
const POPULARITY_HALF_POINT = 5;

/** A pin this many days old scores 0.5 on recency. */
const RECENCY_HALF_LIFE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Scale to 0..1 against the largest value present.
 *
 * Max-normalisation (rather than min-max) on purpose: it keeps a genuine zero
 * at zero. With min-max, the worst candidate always becomes 0 and the best
 * always becomes 1 — even when every one of them is equally irrelevant.
 */
function normalize(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0) return values.map(() => 0);
  return values.map((value) => value / max);
}

export function makeHybrid(weights: HybridWeights = DEFAULT_WEIGHTS) {
  return function hybrid(input: RecommendationInput): ScoredPin[] {
    const { candidates, favoriteSets, now } = input;
    if (candidates.length === 0) return [];

    // ── Component 1 & 2: run both base algorithms ─────────────────────────
    const contentScores = contentBased(input);
    const collaborativeScores = collaborative(input);

    // Index by pin id — the two arrays are in the same order today, but relying
    // on that would be a nasty bug the moment someone adds a filter.
    const contentById = new Map(contentScores.map((s) => [s.pin.id, s]));
    const collaborativeById = new Map(collaborativeScores.map((s) => [s.pin.id, s]));

    // ── Component 3: popularity, saturating ───────────────────────────────
    const saveCounts = new Map<string, number>();
    for (const pinIds of favoriteSets.values()) {
      for (const pinId of pinIds) saveCounts.set(pinId, (saveCounts.get(pinId) ?? 0) + 1);
    }

    // ── Component 4: recency, exponential decay ───────────────────────────
    const recencyOf = (createdAt: number): number => {
      const ageDays = Math.max(0, (now - createdAt) / DAY_MS);
      return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    };

    // ── Normalise each component across this candidate set ────────────────
    const rawContent = candidates.map((p) => contentById.get(p.id)?.score ?? 0);
    const rawCollab = candidates.map((p) => collaborativeById.get(p.id)?.score ?? 0);
    const rawPopularity = candidates.map((p) => {
      const saves = saveCounts.get(p.id) ?? 0;
      return saves / (saves + POPULARITY_HALF_POINT);
    });
    const rawRecency = candidates.map((p) => recencyOf(p.createdAt));

    const content = normalize(rawContent);
    const collab = normalize(rawCollab);
    const popularity = normalize(rawPopularity);
    const recency = normalize(rawRecency);

    // ── Cold start: no co-save signal anywhere? Give its weight to content ──
    const hasCollaborativeSignal = rawCollab.some((value) => value > 0);
    const effective: HybridWeights = hasCollaborativeSignal
      ? weights
      : {
          ...weights,
          content: weights.content + weights.collaborative,
          collaborative: 0,
        };

    // ── Blend ─────────────────────────────────────────────────────────────
    return candidates.map((pin, index) => {
      const parts = {
        content: effective.content * content[index],
        collaborative: effective.collaborative * collab[index],
        popularity: effective.popularity * popularity[index],
        recency: effective.recency * recency[index],
      };

      const score = parts.content + parts.collaborative + parts.popularity + parts.recency;

      // Explain the pin using whichever component actually drove the score —
      // this is the difference between a debuggable ranker and a black box.
      const dominant = (Object.keys(parts) as Array<keyof typeof parts>).reduce((best, key) =>
        parts[key] > parts[best] ? key : best,
      );

      const reason =
        score === 0
          ? "No signal yet"
          : dominant === "collaborative"
            ? (collaborativeById.get(pin.id)?.reason ?? "Saved by the same people")
            : dominant === "content"
              ? (contentById.get(pin.id)?.reason ?? "Similar subject")
              : dominant === "popularity"
                ? "Popular right now"
                : "Freshly added";

      return { pin, score, reason };
    });
  };
}

export const hybrid = makeHybrid();
