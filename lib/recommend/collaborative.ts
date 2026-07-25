// ══════════════════════════════════════════════════════════════════════════
//  ALGORITHM 2 — ITEM-ITEM COLLABORATIVE FILTERING  (Jaccard on co-favourites)
// ══════════════════════════════════════════════════════════════════════════
//
//  Question it answers:  "people who saved this also saved…?"
//  Signal it uses:       behaviour only. It never looks at the image or title.
//
//  The data is a matrix of who-saved-what. Transposed, each PIN becomes a set
//  of the users who saved it:
//
//        savers(A) = {ann, bo, cy}
//        savers(B) = {bo, cy, di}
//
//  Similarity is then just set overlap. We use the Jaccard index:
//
//        J(A,B) = |savers(A) ∩ savers(B)| / |savers(A) ∪ savers(B)|
//               = 2 / 4 = 0.5
//
//  Dividing by the UNION is what stops a hugely popular pin from looking
//  similar to everything: it overlaps with lots of pins, but its union is
//  enormous, so each individual score stays small. (Raw intersection count has
//  no such defence — that's the classic beginner mistake here.)
//
//  Strength:  finds genuinely non-obvious pairs. Two photos with nothing in
//             common textually get linked because the same people love both.
//             This is where "how did it know?" recommendations come from.
//  Weakness:  COLD START. A brand-new pin has no savers, so it scores 0 against
//             everything and can never be recommended — and with no favourites
//             at all in the system, this algorithm returns nothing useful.
//             That's exactly the gap the hybrid fills.
//
//  Cost: O(users × saves) to transpose, then O(candidates × |savers|) to score.

import type { RecommendationInput, ScoredPin } from "./types";

/** Turn userId -> pins into pinId -> users. */
function invertToSaversByPin(
  favoriteSets: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const savers = new Map<string, Set<string>>();

  for (const [userId, pinIds] of favoriteSets) {
    for (const pinId of pinIds) {
      let set = savers.get(pinId);
      if (!set) {
        set = new Set<string>();
        savers.set(pinId, set);
      }
      set.add(userId);
    }
  }

  return savers;
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0 };

  // Walk the smaller set — same answer, less work.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];

  let intersection = 0;
  for (const value of small) if (large.has(value)) intersection++;

  const union = a.size + b.size - intersection;
  return { score: union === 0 ? 0 : intersection / union, shared: intersection };
}

export function collaborative({
  subject,
  candidates,
  favoriteSets,
}: RecommendationInput): ScoredPin[] {
  const saversByPin = invertToSaversByPin(favoriteSets);
  const subjectSavers = saversByPin.get(subject.id) ?? new Set<string>();

  return candidates.map((pin) => {
    const { score, shared } = jaccard(subjectSavers, saversByPin.get(pin.id) ?? new Set());

    return {
      pin,
      score,
      reason:
        shared > 0
          ? `${shared} ${shared === 1 ? "person" : "people"} saved both`
          : "No shared saves yet",
    };
  });
}
