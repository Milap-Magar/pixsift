// ══════════════════════════════════════════════════════════════════════════
//  ALGORITHM 1 — PERCEPTUAL HASH (pHash), DCT-based, 64 bits
// ══════════════════════════════════════════════════════════════════════════
//
//  A perceptual hash answers a question a cryptographic hash cannot:
//
//      "are these two files the same PICTURE?"
//
//  SHA-256 answers "are these the same BYTES?". Those are different questions,
//  and for a photo library the byte question is almost useless. Re-save a JPEG
//  at quality 90 instead of 95 and every bit of its SHA-256 changes; the
//  photograph is identical to a human. A perceptual hash is built so that a
//  small change to the PICTURE produces a small change to the HASH — the exact
//  property a cryptographic hash is designed to destroy.
//
//  ── The pipeline ─────────────────────────────────────────────────────────
//
//      1. resize to 32×32, grayscale   →  discard resolution and colour
//      2. 2-D DCT                      →  move detail into the corners
//      3. keep the top-left 8×8        →  discard the detail
//      4. median of that block         →  pick a threshold from the image itself
//      5. one bit per coefficient      →  64 bits: "above the median?"
//
//  Every step is throwing information away on purpose. What survives all five
//  is the coarse light-and-dark structure of the photograph, which is roughly
//  what a person means by "what it looks like".
//
//  ── Why each step is the step it is ──────────────────────────────────────
//
//  1. RESIZE TO 32×32, GRAYSCALE.
//     Resizing to a fixed grid is what makes the hash resolution-independent:
//     a 4000px original and its 800px thumbnail both become the same 32×32
//     grid, so they hash alike. Grayscale drops colour because colour is the
//     least stable thing about a photograph — white balance, filters and
//     re-encoding all shift it while the composition stays put. Colour is not
//     lost to the project, it is simply handled by a better tool: k-means, in
//     ./kmeans.ts.
//
//     32 and not 8: the DCT needs enough samples for the low-frequency
//     coefficients to be meaningful. Hashing an 8×8 image would leave the
//     transform nothing to concentrate.
//
//  2. THE DCT. See ./dct.ts — it has the full explanation. In one line: it
//     re-expresses the grid as cosine waves so that "broad shape" and "fine
//     detail" end up in different places, and can therefore be separated.
//
//  3. THE TOP-LEFT 8×8. The lossy step. 64 of 1,024 coefficients survive.
//     Everything an edit typically perturbs — compression artefacts, noise,
//     sharpening, a small watermark — lives in the coefficients this step
//     deletes. That is not a happy accident; it is why the DCT is here.
//
//  4. THE MEDIAN, NOT THE MEAN. Both were tried, and the median is materially
//     better. The DC coefficient (index 0) is the image's mean brightness,
//     scaled up by 32 — it is routinely an order of magnitude larger than any
//     other coefficient in the block. A mean is dragged bodily by that one
//     outlier, so nearly every other coefficient lands below it and the hash
//     collapses towards all-zeros, throwing away most of its 64 bits. A median
//     is a rank statistic: one enormous value moves it by one position, not by
//     its magnitude. We also exclude the DC term from the median calculation
//     outright — see `medianExcludingDC` below.
//
//     Taking the threshold FROM THE IMAGE rather than using a constant is what
//     makes the hash invariant to brightness and contrast changes. Brighten
//     every pixel and every coefficient scales together — the median scales with
//     them, and every comparison lands the same way. The bits do not move.
//
//  5. ONE BIT PER COEFFICIENT. The output is 64 bits, written as 16 hex
//     characters so it stores as a plain indexed string in MongoDB.
//
//  ── An honest note about bit 0 ───────────────────────────────────────────
//  Bit 0 is the DC coefficient compared against a median computed without it.
//  DC is the largest value in the block for essentially every real photograph,
//  so bit 0 is 1 essentially always. It carries no information, and the hash is
//  therefore ~63 informative bits, not 64.
//
//  This is worth stating plainly rather than hiding, because it is exactly the
//  kind of thing a viva question lands on. It is kept for two reasons: it is
//  what the widely-cited reference implementation does (Krawetz, "Looks Like
//  It", 2011), so our hashes stay comparable with the literature the report
//  cites; and a constant bit contributes 0 to every Hamming distance, so it
//  cannot bias a comparison — it only fails to help. Dropping it would buy one
//  extra bit of resolution and cost comparability. The trade was made
//  deliberately in favour of comparability.
//
//  ── What this algorithm cannot do ────────────────────────────────────────
//  It is not rotation-invariant: turn a photo 90° and the hash is unrelated.
//  It is not crop-invariant beyond a few percent, because cropping moves every
//  feature to a different cell of the 32×32 grid. It says nothing about
//  SUBJECT — two different sunsets with the same composition will score as
//  near-duplicates, and two photos of the same person in different poses will
//  not. Those limits are measured, not guessed: see docs/algorithms/EVALUATION.md.

import { dct2d, lowFrequencyBlock } from "./dct";

/** The grid the image is resized to before transforming. */
export const HASH_IMAGE_SIZE = 32;

/** The edge of the low-frequency block kept after the transform. 8 × 8 = 64 bits. */
export const HASH_BLOCK_SIZE = 8;

/** How many bits the hash carries. */
export const HASH_BITS = HASH_BLOCK_SIZE * HASH_BLOCK_SIZE;

/** How many hex characters that is — 4 bits per character. */
export const HASH_HEX_LENGTH = HASH_BITS / 4;

/**
 * The median of the block, ignoring the DC term at index 0.
 *
 * `toSorted` rather than `sort` because sorting in place would scramble the
 * caller's block, and the caller still needs it in coefficient order to emit
 * the bits in the right sequence.
 *
 * With 63 values (an odd count) the median is the single middle element, so no
 * averaging of two neighbours is needed — but the general form is written out
 * anyway so that changing HASH_BLOCK_SIZE doesn't silently break it.
 */
function medianExcludingDC(block: Float64Array): number {
  const values = Array.from(block.slice(1)).sort((a, b) => a - b);

  const middle = values.length >> 1;
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

/**
 * Compute the 64-bit perceptual hash of a 32×32 grayscale image.
 *
 * @param gray  exactly `HASH_IMAGE_SIZE²` brightness values, row-major, 0–255.
 *              Produced by `grayscaleMatrix()` in ./pixels.ts, which is the only
 *              place `sharp` is allowed to touch this pipeline: sharp decodes
 *              and resizes, and every line of the algorithm itself is here.
 * @returns     16 lowercase hex characters, e.g. `"f8e0c1830f1e3c7c"`.
 */
export function perceptualHash(gray: Float64Array): string {
  if (gray.length !== HASH_IMAGE_SIZE * HASH_IMAGE_SIZE) {
    throw new Error(
      `perceptualHash: expected ${HASH_IMAGE_SIZE * HASH_IMAGE_SIZE} pixels, got ${gray.length}.`,
    );
  }

  // Steps 2 and 3.
  const coefficients = dct2d(gray, HASH_IMAGE_SIZE);
  const block = lowFrequencyBlock(coefficients, HASH_IMAGE_SIZE, HASH_BLOCK_SIZE);

  // Step 4.
  const threshold = medianExcludingDC(block);

  // Step 5. Bits are emitted most-significant-first so that reading the hex
  // string left to right walks the block in the same order as `block` itself —
  // which is what lets `hashToBits()` render an 8×8 grid that lines up with the
  // coefficients it came from.
  let hex = "";
  for (let i = 0; i < HASH_BITS; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) {
      nibble = (nibble << 1) | (block[i + j] > threshold ? 1 : 0);
    }
    hex += nibble.toString(16);
  }

  return hex;
}

/** True when a string is shaped like one of our hashes. */
export function isPerceptualHash(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${HASH_HEX_LENGTH}}$`).test(value);
}

/**
 * Expand a hash into 64 booleans, most-significant bit first.
 *
 * Used by the UI to draw the hash as an 8×8 grid of black and white squares
 * (see app/components/hash-grid.tsx). That visual is worth more than it looks:
 * "these two images have a Hamming distance of 6" is an abstraction, while two
 * 8×8 grids that visibly share a pattern is something a reader can check with
 * their own eyes in a second.
 */
export function hashToBits(hash: string): boolean[] {
  const bits: boolean[] = [];

  for (const character of hash) {
    const nibble = parseInt(character, 16);
    for (let j = 3; j >= 0; j--) bits.push(((nibble >> j) & 1) === 1);
  }

  return bits;
}
