// ══════════════════════════════════════════════════════════════════════════
//  ALGORITHM 3 — k-MEANS CLUSTERING FOR DOMINANT-COLOUR EXTRACTION
// ══════════════════════════════════════════════════════════════════════════
//
//  Given every pixel of a photograph, produce the handful of colours a person
//  would name if you asked them what colour the photo is.
//
//  ── Why this is a clustering problem at all ──────────────────────────────
//  The obvious approaches both fail, and understanding why is the argument for
//  the one that works:
//
//    · AVERAGE EVERY PIXEL. One colour out, and it is almost always mud. A
//      photo of a red sail on blue water averages to grey — a colour that
//      appears nowhere in the image and describes it not at all. The mean of a
//      multi-modal distribution sits in the empty space between the modes.
//    · COUNT THE MOST COMMON EXACT VALUES. A 12-megapixel photograph contains
//      hundreds of thousands of DISTINCT RGB values, because sensor noise and
//      JPEG artefacts mean no two pixels of "the same" sky are byte-identical.
//      The most common exact value might occur forty times out of twelve
//      million. You get a histogram spike, not a dominant colour.
//
//  The real structure is that pixels form CLOUDS in RGB space — a loose blob of
//  blues for the water, another of reds for the sail. "Dominant colour" means
//  "centre of a large cloud". Finding the centres of clouds in a space is
//  exactly what clustering does, and k-means is the simplest algorithm that
//  does it.
//
//  ── The algorithm (Lloyd's) ──────────────────────────────────────────────
//
//      1. choose k starting centroids                    (see k-means++ below)
//      2. ASSIGN   each pixel to its nearest centroid
//      3. UPDATE   move each centroid to the mean of the pixels assigned to it
//      4. repeat 2–3 until nothing moves          (or the iteration cap is hit)
//
//  Steps 2 and 3 each provably reduce the total squared distance from pixels to
//  their centroids, so the loop cannot oscillate forever — it always converges.
//  What it converges TO is a LOCAL minimum, not necessarily the best possible
//  one, which is what step 1 is about.
//
//  ── Why k-means, and not the alternatives ────────────────────────────────
//    · MEDIAN CUT is the classic palette algorithm (it is what GIF quantisation
//      used). It repeatedly splits the colour box along its longest axis. It is
//      faster and needs no iteration, but it splits by VOLUME rather than by
//      population, so a handful of bright outlier pixels can claim a whole
//      palette entry while the sky the photo is actually made of gets one.
//    · DBSCAN finds clusters of arbitrary shape and does not need k chosen in
//      advance — genuinely appealing. But it needs a density radius ε chosen
//      instead, and the right ε differs between a foggy landscape (one dense
//      blob) and a neon sign (several sparse ones). Swapping "choose k" for
//      "choose ε" is not a simplification, and unlike k, ε has no natural
//      value suggested by the use case.
//    · A GAUSSIAN MIXTURE MODEL is k-means' probabilistic generalisation and
//      would model soft gradients better. It costs an order of magnitude more
//      code and compute for a palette strip nobody will inspect that closely.
//
//  k-means wins here because the thing being asked for — "k representative
//  colours, with how much of the image each covers" — is literally its output
//  format. k is not an awkward hyperparameter in this application: it is the
//  number of swatches the design calls for.
//
//  ── The two decisions that make it reproducible ──────────────────────────
//  A textbook k-means is random twice over: random initial centroids, and
//  random tie-breaking. That means re-running it on the same photo can give a
//  different palette, which would make every number in the report unreproducible
//  and every screenshot a one-off. Both sources of randomness are removed here —
//  see `SeededRandom` and the k-means++ notes below.

import { toHex, type Rgb, type Swatch } from "./color";

/** How many dominant colours to extract. Five fills a palette strip without repeats. */
export const DEFAULT_K = 5;

/** Hard stop, so a pathological image cannot spin the upload path forever. */
const MAX_ITERATIONS = 40;

/**
 * Convergence test: stop when no centroid moved further than this in RGB units.
 *
 * Testing centroid MOVEMENT rather than "no pixel changed cluster" matters at
 * this scale. With tens of thousands of pixels there is almost always one on a
 * boundary flipping back and forth between two nearly-equidistant centroids,
 * so the strict test would run all 40 iterations every time while the palette
 * stopped changing meaningfully around iteration eight.
 */
const CONVERGENCE_EPSILON = 0.5;

/**
 * A small deterministic PRNG (mulberry32).
 *
 * `Math.random()` cannot be used anywhere in this file. k-means++ makes random
 * choices, and with `Math.random()` the same photograph would produce a
 * different palette on every run — different swatches on the detail page after
 * a re-analyse, different colour-search results, and no number in the report
 * reproducible by anyone marking it. Seeding from the image's own pixel data
 * (see `paletteFromPixels`) makes the whole extractor a pure function of the
 * image: same photo in, same palette out, forever.
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Force to an unsigned 32-bit integer; a float or a negative seed would
    // break the arithmetic below.
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/**
 * Squared Euclidean distance in RGB.
 *
 * SQUARED, with no `Math.sqrt`. The square root is a monotonic function, so it
 * cannot change which centroid is nearest — and this runs k times per pixel per
 * iteration, which is the hottest line in the file. Skipping it is free
 * correctness-preserving speed. (It does mean the values here are not ΔE and
 * are never shown to anyone; the palette's user-facing distances come from
 * `colorDistance` in ./color.ts, which works in Lab.)
 */
function squaredDistance(
  pixels: Uint8ClampedArray,
  pixelIndex: number,
  centroids: Float64Array,
  centroidIndex: number,
): number {
  const p = pixelIndex * 3;
  const c = centroidIndex * 3;

  const dr = pixels[p] - centroids[c];
  const dg = pixels[p + 1] - centroids[c + 1];
  const db = pixels[p + 2] - centroids[c + 2];

  return dr * dr + dg * dg + db * db;
}

/**
 * k-means++ initialisation.
 *
 * Pick the first centroid at random, then pick each subsequent one with
 * probability proportional to its squared distance from the nearest centroid
 * already chosen. In plain terms: **spread the starting points out, but let the
 * data decide where.**
 *
 * This is not a micro-optimisation, it is what makes the result trustworthy.
 * With k random starting pixels, a photograph that is 70% sky will very likely
 * get three or four of its five centroids inside that one blue cloud — they
 * then split the sky into shades of itself while the sail, the sand and the
 * subject share one leftover swatch. The palette comes out obviously wrong, and
 * because Lloyd's algorithm only ever finds the nearest local minimum, no
 * amount of iterating rescues it. k-means++ makes that outcome unlikely by
 * construction, and it comes with a proof: its expected error is within
 * O(log k) of the best possible clustering (Arthur & Vassilvitskii, 2007).
 *
 * The randomness is drawn from the seeded generator, so "at random" here still
 * means "identically on every run".
 */
function initialiseCentroids(
  pixels: Uint8ClampedArray,
  pixelCount: number,
  k: number,
  random: SeededRandom,
): Float64Array {
  const centroids = new Float64Array(k * 3);

  // First centroid: a uniformly random pixel.
  const first = Math.floor(random.next() * pixelCount);
  centroids[0] = pixels[first * 3];
  centroids[1] = pixels[first * 3 + 1];
  centroids[2] = pixels[first * 3 + 2];

  // Distance from each pixel to the nearest centroid chosen so far.
  const nearest = new Float64Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) nearest[i] = squaredDistance(pixels, i, centroids, 0);

  for (let chosen = 1; chosen < k; chosen++) {
    let total = 0;
    for (let i = 0; i < pixelCount; i++) total += nearest[i];

    // Every pixel is already exactly on a centroid — the image has fewer
    // distinct colours than k. Duplicating the last centroid is fine: the empty
    // clusters get dropped when the palette is assembled.
    if (total === 0) {
      centroids.copyWithin(chosen * 3, (chosen - 1) * 3, chosen * 3);
      continue;
    }

    // Weighted sampling: walk the pixels accumulating their distances until the
    // running total passes a random point in [0, total). A pixel far from every
    // existing centroid occupies a proportionally wider slice of that line and
    // is correspondingly more likely to be landed on.
    let target = random.next() * total;
    let picked = pixelCount - 1;
    for (let i = 0; i < pixelCount; i++) {
      target -= nearest[i];
      if (target <= 0) {
        picked = i;
        break;
      }
    }

    centroids[chosen * 3] = pixels[picked * 3];
    centroids[chosen * 3 + 1] = pixels[picked * 3 + 1];
    centroids[chosen * 3 + 2] = pixels[picked * 3 + 2];

    // Fold the new centroid into the running nearest-distance array, rather
    // than recomputing all k distances for every pixel next round.
    for (let i = 0; i < pixelCount; i++) {
      const d = squaredDistance(pixels, i, centroids, chosen);
      if (d < nearest[i]) nearest[i] = d;
    }
  }

  return centroids;
}

export type KMeansResult = {
  swatches: Swatch[];
  /** How many assign/update rounds ran before convergence. Shown in the admin view. */
  iterations: number;
  /** Mean squared distance from a pixel to its centroid — lower is a tighter fit. */
  inertia: number;
};

/**
 * Run k-means over RGB pixels and return the palette, most-dominant first.
 *
 * @param pixels  packed RGB triplets, `pixelCount * 3` bytes. From
 *                `rgbSamples()` in ./pixels.ts.
 * @param seed    seeds the PRNG. Callers pass something derived from the image
 *                so the result is reproducible per image.
 */
export function kMeans(
  pixels: Uint8ClampedArray,
  opts: { k?: number; seed?: number } = {},
): KMeansResult {
  const pixelCount = Math.floor(pixels.length / 3);
  const k = Math.max(1, Math.min(opts.k ?? DEFAULT_K, pixelCount));

  if (pixelCount === 0) return { swatches: [], iterations: 0, inertia: 0 };

  const random = new SeededRandom(opts.seed ?? 1);
  const centroids = initialiseCentroids(pixels, pixelCount, k, random);

  // Running totals per cluster, so the UPDATE step is one pass rather than a
  // second scan per centroid: sum the members as they are assigned, then divide.
  const sums = new Float64Array(k * 3);
  const counts = new Int32Array(k);

  let iterations = 0;
  let inertia = 0;

  for (; iterations < MAX_ITERATIONS; iterations++) {
    sums.fill(0);
    counts.fill(0);
    inertia = 0;

    // ── ASSIGN ────────────────────────────────────────────────────────────
    for (let i = 0; i < pixelCount; i++) {
      let best = 0;
      let bestDistance = Infinity;

      for (let c = 0; c < k; c++) {
        const d = squaredDistance(pixels, i, centroids, c);
        // Strictly `<`, so the LOWEST-INDEXED centroid wins a tie. An arbitrary
        // rule, but a fixed one — which is the second half of making this
        // reproducible, alongside the seeded PRNG.
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }

      inertia += bestDistance;

      counts[best]++;
      sums[best * 3] += pixels[i * 3];
      sums[best * 3 + 1] += pixels[i * 3 + 1];
      sums[best * 3 + 2] += pixels[i * 3 + 2];
    }

    // ── UPDATE ────────────────────────────────────────────────────────────
    let largestShift = 0;

    for (let c = 0; c < k; c++) {
      // An empty cluster has no mean to move to. Leaving it where it is (rather
      // than the common trick of re-seeding it onto the worst-fitting pixel) is
      // deliberate: a re-seed would chase outliers, and an empty cluster here
      // just means the image has fewer than k distinct colour regions, which is
      // a true fact about the image. It is dropped from the palette below.
      if (counts[c] === 0) continue;

      const r = sums[c * 3] / counts[c];
      const g = sums[c * 3 + 1] / counts[c];
      const b = sums[c * 3 + 2] / counts[c];

      largestShift = Math.max(
        largestShift,
        Math.hypot(r - centroids[c * 3], g - centroids[c * 3 + 1], b - centroids[c * 3 + 2]),
      );

      centroids[c * 3] = r;
      centroids[c * 3 + 1] = g;
      centroids[c * 3 + 2] = b;
    }

    if (largestShift < CONVERGENCE_EPSILON) {
      iterations++;
      break;
    }
  }

  // ── Assemble the palette ──────────────────────────────────────────────────
  const swatches: Swatch[] = [];

  for (let c = 0; c < k; c++) {
    if (counts[c] === 0) continue;

    const color: Rgb = {
      r: Math.round(centroids[c * 3]),
      g: Math.round(centroids[c * 3 + 1]),
      b: Math.round(centroids[c * 3 + 2]),
    };

    swatches.push({ ...color, hex: toHex(color), share: counts[c] / pixelCount });
  }

  // Biggest share first — that is what "dominant" means, and it is the order
  // the palette strip renders in. Tie-broken on hex so the order is stable.
  swatches.sort((a, b) => b.share - a.share || a.hex.localeCompare(b.hex));

  return { swatches, iterations, inertia: inertia / pixelCount };
}
