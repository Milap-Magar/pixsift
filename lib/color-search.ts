// ── Ranking photographs by colour ───────────────────────────────────────────
//
// "Show me photos that are mostly this green." The retrieval half of that
// question is a database filter (`listPinsWithPalette` narrows by colour family
// through an index); this file is the ranking half, and it is where the k-means
// output finally does something a user asked for directly.
//
// Pure, and takes `now` from nobody — no I/O, no clock — so a test can drive it
// with a literal array. Same contract as lib/recommend/.
//
// ── The scoring function, and why it is a sum and not a minimum ────────────
// The obvious score is "distance from the target to the nearest swatch". It
// ranks badly, and the reason is instructive: it ignores HOW MUCH of the photo
// that swatch covers. A landscape with one 2%-of-the-frame red flower would
// beat a photograph that is entirely red, because both have a swatch at ΔE 3
// and the tiebreak never happens.
//
// So each swatch contributes both its closeness AND its share:
//
//     contribution = share × max(0, 1 − ΔE / CUTOFF)
//     score        = Σ contributions over the palette
//
// Reading it in words: a swatch counts for as much of the image as it covers,
// scaled down by how far its colour is from the target, and dropped entirely
// past the point where a person would call it a different colour. Summing
// rather than taking the best one means a photo with three nearby shades of the
// target — which is what a real monochrome photograph looks like after
// clustering — outranks one with a single exact hit and four unrelated colours.
// That is the correct answer to "show me green photos".
//
// The score's units are meaningful, which is worth having: a score of 1.0 would
// be a photograph every pixel of which is exactly the target colour, and 0.4
// means roughly "40% of this image is close to what you asked for".

import { colorDistance, colorFamily, type ColorFamily, type Rgb } from "@/lib/algorithms/color";
import type { SavedPin } from "@/lib/db/pins";

/**
 * The ΔE past which a colour stops counting at all.
 *
 * 60 is comfortably outside "a different shade of the same colour" (ΔE ~10–20)
 * and inside "a different colour entirely" (ΔE 100+, e.g. blue against yellow).
 * Its job is to stop distant swatches contributing a small positive amount each:
 * without a cutoff, a photograph with five unrelated colours accumulates a
 * respectable score purely by having a full palette, and the ranking degrades
 * into "which photos have the most colours in them".
 */
const CUTOFF_DELTA_E = 60;

/** Below this, a pin isn't really "in" the colour and is dropped from results. */
const MIN_SCORE = 0.04;

export type ColorMatch = {
  pin: SavedPin;
  score: number;
  /** The single closest swatch — rendered next to the result as the "why". */
  closest: { hex: string; share: number; deltaE: number };
};

/**
 * Rank pins by how much of each one is close to `target`.
 *
 * @param pins    candidates, each expected to carry a `palette`. Pins without
 *                one are skipped rather than scored as zero — "not analysed
 *                yet" and "contains none of this colour" are different facts,
 *                and only the second belongs at the bottom of a result list.
 */
export function rankByColor(
  pins: readonly SavedPin[],
  target: Rgb,
  opts: { limit?: number } = {},
): ColorMatch[] {
  const matches: ColorMatch[] = [];

  for (const pin of pins) {
    if (!pin.palette?.length) continue;

    let score = 0;
    let closest: ColorMatch["closest"] | null = null;

    for (const swatch of pin.palette) {
      const deltaE = colorDistance(target, swatch);

      if (!closest || deltaE < closest.deltaE) {
        closest = { hex: swatch.hex, share: swatch.share, deltaE };
      }

      if (deltaE >= CUTOFF_DELTA_E) continue;
      score += swatch.share * (1 - deltaE / CUTOFF_DELTA_E);
    }

    if (!closest || score < MIN_SCORE) continue;
    matches.push({ pin, score, closest });
  }

  // Highest score first, tie-broken on id so two pins that score identically
  // always come back in the same order — otherwise the same search could
  // reorder itself between requests depending on how Mongo paged the rows.
  matches.sort((a, b) => b.score - a.score || a.pin.id.localeCompare(b.pin.id));

  return opts.limit ? matches.slice(0, opts.limit) : matches;
}

/**
 * The colour families worth pre-filtering on for a given target.
 *
 * Returns the target's own family plus its two hue neighbours, because the
 * bucket boundaries in `colorFamily()` are arbitrary lines through a continuum:
 * a target at hue 44° is "orange", but a photograph full of hue 46° yellows is a
 * genuinely good match sitting one bucket over. Filtering on the single family
 * would make results vanish as the picker crossed an invisible line.
 *
 * Neutral targets get no filter at all — greys appear in almost every
 * photograph, so narrowing would exclude most of the corpus for no benefit.
 */
export function familiesToSearch(target: Rgb): ColorFamily[] | undefined {
  const family = colorFamily(target);
  if (family === "neutral") return undefined;

  const wheel: ColorFamily[] = [
    "red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink",
  ];

  const index = wheel.indexOf(family);
  if (index === -1) return [family];

  return [
    wheel[(index - 1 + wheel.length) % wheel.length],
    family,
    wheel[(index + 1) % wheel.length],
    // Neutrals ride along because a photograph that is 70% grey sky and 30% the
    // target colour is a legitimate result, and its palette's dominant family
    // is grey.
    "neutral",
  ];
}
