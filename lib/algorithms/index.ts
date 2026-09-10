// ══════════════════════════════════════════════════════════════════════════
//  PixSift's three algorithms
// ══════════════════════════════════════════════════════════════════════════
//
//  Every one of these is implemented by hand in this folder. No npm package
//  computes a transform, a distance, or a cluster for us — `sharp` decodes and
//  resizes image files in ./pixels.ts and does nothing else. See
//  docs/algorithms/ for the full write-up of each, why it was chosen over the
//  alternatives, and the measured results.
//
//    1. PERCEPTUAL HASH   ./dct.ts + ./phash.ts
//       A 2-D discrete cosine transform reduces a photo to the 64 bits that
//       describe what it looks like, independent of size, format and
//       brightness.
//
//    2. HAMMING DISTANCE  ./hamming.ts
//       Counts differing bits between two hashes, turning "how similar are
//       these pictures" into an integer from 0 to 64 — and, with a threshold,
//       into a near-duplicate verdict.
//
//    3. k-MEANS           ./kmeans.ts (+ ./color.ts for the colour spaces)
//       Clusters a photo's pixels in RGB space to extract the handful of
//       colours it is actually made of, with the share of the image each covers.
//
//  Import from here rather than from the individual files, so a future
//  reorganisation of the folder touches one line instead of thirty.

export { dct2d, lowFrequencyBlock } from "./dct";

export {
  perceptualHash,
  hashToBits,
  isPerceptualHash,
  HASH_BITS,
  HASH_BLOCK_SIZE,
  HASH_HEX_LENGTH,
  HASH_IMAGE_SIZE,
} from "./phash";

export {
  hammingDistance,
  hammingSimilarity,
  findNearDuplicates,
  clusterDuplicates,
  classify,
  DUPLICATE_THRESHOLD,
  IDENTICAL_THRESHOLD,
  type DuplicateVerdict,
  type HashedItem,
  type Match,
} from "./hamming";

export { kMeans, DEFAULT_K, type KMeansResult } from "./kmeans";

export {
  toHex,
  fromHex,
  rgbToLab,
  rgbToHsv,
  deltaE,
  colorDistance,
  luminance,
  readableTextOn,
  colorFamily,
  COLOR_FAMILIES,
  type ColorFamily,
  type Lab,
  type Rgb,
  type Swatch,
} from "./color";
