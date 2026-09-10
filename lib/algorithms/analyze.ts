import "server-only";

// ── One image in, one analysis out ──────────────────────────────────────────
//
// The seam between the algorithms and the rest of the app. Pages, Server
// Actions and scripts call `analyzeImage()`; none of them import sharp, the
// DCT, or k-means directly. That keeps the algorithm modules pure and testable
// (they take arrays and return values — no I/O anywhere) while the messy parts
// of real life — network failures, corrupt files, images that are 404 by the
// time we look — are handled in exactly one place.
//
// ── Analysis must never block a post ────────────────────────────────────────
// Every failure here is soft. If an image cannot be fetched or decoded, the pin
// is still created; it simply has no hash and no palette, and the backfill
// script picks it up later. The alternative — refusing to save someone's photo
// because a colour-clustering step failed — is a product that punishes the user
// for a problem they cannot see and did not cause.
//
// `analyzed: false` in the returned value is how a caller can tell "we looked
// and it failed" from "we never looked", which is what the backfill script
// needs to avoid retrying the same broken URL forever.

import { kMeans, DEFAULT_K } from "./kmeans";
import { perceptualHash } from "./phash";
import { fetchImageBytes, grayscaleMatrix, rgbSamples } from "./pixels";
import type { Swatch } from "./color";

export type ImageAnalysis = {
  /** 16 hex characters, or undefined if hashing failed. */
  phash?: string;
  /** Dominant colours, most-dominant first, or undefined if clustering failed. */
  palette?: Swatch[];
  /** How many k-means rounds ran — kept for the report's results section. */
  paletteIterations?: number;
  /** True when at least one of the two produced a result. */
  analyzed: boolean;
  /** Why it failed, when it did. Logged, never shown to the user. */
  error?: string;
};

/**
 * Derive the k-means seed from the image's own bytes.
 *
 * The seed has to be a pure function of the image so the palette is reproducible
 * (see the note on `SeededRandom` in ./kmeans.ts), and it has to DIFFER between
 * images — a single fixed seed would start every clustering run at the same
 * relative position, which biases k-means++ identically for every photograph.
 *
 * This is not a hash function in any security sense and does not need to be:
 * a collision between two images means only that they began their clustering
 * from a similarly-chosen first pixel, which is not a defect. FNV-1a is used
 * because it is four lines and well-distributed over byte data.
 */
function seedFrom(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;

  // Every 997th byte rather than all of them: a stride over a large buffer
  // samples the whole file for effectively nothing, and 997 is prime so it does
  // not fall into step with the image's row width and read one column forever.
  for (let i = 0; i < bytes.length; i += 997) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * Compute the perceptual hash and the dominant-colour palette for one image.
 *
 * The two halves are independent, so they are attempted separately: a photo
 * that defeats one still gets the other. In practice they fail together (both
 * start from the same decode), but a 1-bit-deep PNG, for instance, hashes fine
 * and has a palette of one colour — and that is a real result, not an error.
 *
 * @param source  raw image bytes, or an http(s) URL to fetch them from.
 */
export async function analyzeImage(
  source: Buffer | string,
  opts: { k?: number } = {},
): Promise<ImageAnalysis> {
  let bytes: Buffer;

  try {
    bytes = typeof source === "string" ? await fetchImageBytes(source) : source;
  } catch (error) {
    return { analyzed: false, error: message(error) };
  }

  const analysis: ImageAnalysis = { analyzed: false };

  // ── Algorithms 1 + 2's input: the 64-bit hash ────────────────────────────
  try {
    analysis.phash = perceptualHash(await grayscaleMatrix(bytes));
    analysis.analyzed = true;
  } catch (error) {
    analysis.error = message(error);
  }

  // ── Algorithm 3: the palette ─────────────────────────────────────────────
  try {
    const pixels = await rgbSamples(bytes);
    const { swatches, iterations } = kMeans(pixels, {
      k: opts.k ?? DEFAULT_K,
      seed: seedFrom(bytes),
    });

    analysis.palette = swatches;
    analysis.paletteIterations = iterations;
    analysis.analyzed = true;
  } catch (error) {
    analysis.error ??= message(error);
  }

  return analysis;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
