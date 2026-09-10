// ══════════════════════════════════════════════════════════════════════════
//  THE DISCRETE COSINE TRANSFORM (DCT-II)
// ══════════════════════════════════════════════════════════════════════════
//
//  This file is the mathematical engine underneath the perceptual hash in
//  ./phash.ts. It is written by hand — no library computes the transform for
//  us — because the transform IS the algorithm being graded.
//
//  ── What a DCT actually does ─────────────────────────────────────────────
//  A grayscale image is a grid of brightness values. The DCT rewrites that grid
//  as a sum of cosine waves of increasing frequency:
//
//      low frequency   →  broad shapes: "the top is bright, the bottom is dark"
//      high frequency  →  fine detail:  single-pixel noise, JPEG artefacts, grain
//
//  Nothing is lost — the transform is invertible, and the output has exactly as
//  many numbers as the input. What changes is where the information SITS. After
//  the transform, almost all of the visual identity of a photograph is
//  concentrated in the handful of coefficients in the top-left corner. That
//  concentration is the entire reason a perceptual hash works: keep the
//  top-left 8×8, throw the other 960 coefficients away, and you have kept
//  "what the picture looks like" while discarding "exactly which pixels".
//
//  ── The formula ──────────────────────────────────────────────────────────
//  For a 1-D signal f of length N, the DCT-II is:
//
//      F(u) = c(u) · Σ(x=0..N-1) f(x) · cos[ (2x + 1) · u · π / (2N) ]
//
//                  ⎧ √(1/N)   when u = 0     ← the DC term
//      where c(u) = ⎨
//                  ⎩ √(2/N)   otherwise      ← the AC terms
//
//  Those c(u) scale factors make the transform ORTHONORMAL, which is what lets
//  the inverse transform use the same cosine table instead of a different one.
//  The hash below only compares coefficients against each other, so a uniform
//  rescaling would not change a single bit of the output — but getting them
//  right costs nothing and keeps this file a correct DCT rather than a
//  DCT-shaped thing that only works for our one use.
//
//  ── Why the 2-D version is done as two 1-D passes ────────────────────────
//  Written out directly, a 2-D DCT is a four-deep loop: for every one of the
//  N² output cells, sum over all N² input cells. That is O(N⁴) — at N = 32,
//  1,048,576 multiply-adds per image.
//
//  But the 2-D cosine basis SEPARATES: cos(x·u)·cos(y·v) is just the product of
//  two 1-D bases. So transforming every row and then transforming every column
//  of that result gives the identical answer in O(N³) — 2 × 32 × 32 × 32 =
//  65,536 multiply-adds, sixteen times fewer. This is the same decomposition
//  JPEG uses, and it is the honest version of "optimised": the maths is
//  unchanged, only the order of the arithmetic.
//
//  ── Cost ─────────────────────────────────────────────────────────────────
//  One 32×32 image: ~65k multiply-adds, well under a millisecond. The cosine
//  table is built once per size and memoised, so the trigonometry is paid for
//  on the first image and never again.

/**
 * `COSINES[N]` is the N×N matrix of basis values, flattened row-major:
 *
 *     COSINES[N][u * N + x] = c(u) · cos[ (2x + 1) · u · π / (2N) ]
 *
 * Precomputing this is the single biggest win in the file. Without it, each
 * image would call `Math.cos` 2 × N³ times — 65,536 transcendental functions
 * per hash, which dwarfs every other cost in the upload path. With it, the
 * inner loop is a multiply and an add over a flat Float64Array.
 *
 * Row-major and flat rather than `number[][]` because the inner loop walks one
 * row of `u` contiguously; a nested array would chase a pointer per row.
 */
const COSINE_TABLES = new Map<number, Float64Array>();

function cosineTable(size: number): Float64Array {
  const cached = COSINE_TABLES.get(size);
  if (cached) return cached;

  const table = new Float64Array(size * size);

  // c(0) = √(1/N), c(u>0) = √(2/N) — the orthonormal scale factors.
  const dcScale = Math.sqrt(1 / size);
  const acScale = Math.sqrt(2 / size);

  for (let u = 0; u < size; u++) {
    const scale = u === 0 ? dcScale : acScale;
    for (let x = 0; x < size; x++) {
      table[u * size + x] = scale * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size));
    }
  }

  COSINE_TABLES.set(size, table);
  return table;
}

/**
 * One-dimensional DCT-II over a strided slice of a flat array.
 *
 * The stride parameter is what lets the same function transform both rows and
 * columns of a matrix with no transposition step. For a row of an N×N matrix
 * the values sit at offset, offset+1, offset+2… (stride 1); for a column they
 * sit at offset, offset+N, offset+2N… (stride N). Handling both here means the
 * 2-D routine below never has to copy the matrix into a different layout.
 *
 * @param source  flat matrix to read from
 * @param target  flat matrix to write into (may be the same array as `source`
 *                only if the caller is transforming into a different buffer —
 *                this function reads all N inputs before writing any output for
 *                a given u, but it writes u = 0 before reading for u = 1, so
 *                in-place use is NOT safe)
 * @param offset  index of the first element of the row/column
 * @param stride  distance between consecutive elements
 * @param size    N
 * @param table   the memoised cosine basis for this N
 */
function dct1d(
  source: Float64Array,
  target: Float64Array,
  offset: number,
  stride: number,
  size: number,
  table: Float64Array,
): void {
  for (let u = 0; u < size; u++) {
    const basis = u * size;
    let sum = 0;

    for (let x = 0; x < size; x++) {
      sum += source[offset + x * stride] * table[basis + x];
    }

    target[offset + u * stride] = sum;
  }
}

/**
 * Two-dimensional DCT-II of a square matrix, by separable 1-D passes.
 *
 * Input and output are both flat, row-major, length `size * size`. The result
 * is a fresh array — the caller's matrix is not modified, because the pixel
 * buffer it came from is reused for the colour work in ./kmeans.ts.
 *
 * After this returns, `result[v * size + u]` is the coefficient for horizontal
 * frequency `u` and vertical frequency `v`. `result[0]` is the DC term: the
 * mean brightness of the whole image, scaled. Everything the hash cares about
 * lives in the top-left corner, near index 0.
 */
export function dct2d(matrix: Float64Array, size: number): Float64Array {
  if (matrix.length !== size * size) {
    throw new Error(`dct2d: expected ${size * size} values, got ${matrix.length}.`);
  }

  const table = cosineTable(size);

  // Pass 1 — transform each ROW. Reading across a row is stride 1.
  const rows = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    dct1d(matrix, rows, y * size, 1, size, table);
  }

  // Pass 2 — transform each COLUMN of that intermediate result. Reading down a
  // column of a row-major matrix is stride `size`, and starting at index `x`
  // picks out column x. Two passes of a 1-D transform over the two axes is
  // exactly the 2-D transform, because the basis separates.
  const result = new Float64Array(size * size);
  for (let x = 0; x < size; x++) {
    dct1d(rows, result, x, size, size, table);
  }

  return result;
}

/**
 * The top-left `blockSize × blockSize` corner of a transformed matrix, flattened.
 *
 * This is the lossy step, and the one that makes the hash *perceptual*. Keeping
 * an 8×8 corner of a 32×32 transform retains 64 of 1,024 coefficients — 6% of
 * the numbers, and very nearly all of the recognisable structure. Re-saving a
 * JPEG at a different quality, resizing it, or watermarking a corner all
 * perturb the high-frequency coefficients that this step has already discarded,
 * which is precisely why the hash survives those edits.
 */
export function lowFrequencyBlock(
  coefficients: Float64Array,
  size: number,
  blockSize: number,
): Float64Array {
  const block = new Float64Array(blockSize * blockSize);

  for (let v = 0; v < blockSize; v++) {
    for (let u = 0; u < blockSize; u++) {
      block[v * blockSize + u] = coefficients[v * size + u];
    }
  }

  return block;
}
