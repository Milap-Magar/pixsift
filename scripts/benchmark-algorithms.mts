// ── Where the time actually goes ────────────────────────────────────────────
//
//   bun run db:benchmark
//
// Produces the cost table in docs/algorithms/README.md. It exists because the
// first version of that table was written from intuition and was wrong by a
// factor of six — the numbers below are measured over real photographs from the
// live database, not estimated.
//
// The split that matters is `sharp`'s work against ours. Decoding a JPEG costs
// more than all three algorithms put together, which is what justifies
// downsampling before clustering and using a linear scan for duplicate
// detection: at this scale, the algorithms are not the bottleneck.
//
// Every measurement warms up once before timing, so the first run's JIT
// compilation isn't counted as if it were steady-state cost.

import { fetchImageBytes, grayscaleMatrix, rgbSamples } from "../lib/algorithms/pixels";
import { perceptualHash } from "../lib/algorithms/phash";
import { kMeans } from "../lib/algorithms/kmeans";
import { hammingDistance } from "../lib/algorithms/hamming";
import { listAllPins, listPinHashes } from "../lib/db/pins";
import { getClient } from "../lib/mongodb";

const pins = await listAllPins({ limit: 6 });
const buffers = await Promise.all(pins.map(p => fetchImageBytes(p.imageUrl)));

/**
 * Time `fn` over `runs` repetitions and report the cost PER IMAGE.
 *
 * Dividing by `perRun` is the whole point. Each call processes every buffer, so
 * dividing by `runs` alone gives the cost of a batch — which is what the first
 * version of the docs quoted as a per-image figure, overstating k-means by 6x.
 */
const time = async <T,>(
  label: string,
  runs: number,
  perRun: number,
  fn: () => T | Promise<T>,
) => {
  await fn(); // warm up: don't time the JIT
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) await fn();
  const ms = (performance.now() - t0) / runs / perRun;
  console.log(`  ${label.padEnd(34)} ${ms.toFixed(2)} ms`);
  return ms;
};

console.log(`Per image, averaged over ${buffers.length} real photographs\n`);

const decodeHash = await time("decode + resize 32x32 (sharp)", 20, buffers.length, async () => {
  for (const b of buffers) await grayscaleMatrix(b);
});
const grays = await Promise.all(buffers.map(grayscaleMatrix));
const hash = await time("DCT + hash (OURS)", 200, buffers.length, () => { for (const g of grays) perceptualHash(g); });

const decodeColor = await time("decode + resize 96x96 (sharp)", 20, buffers.length, async () => {
  for (const b of buffers) await rgbSamples(b);
});
const samples = await Promise.all(buffers.map(rgbSamples));
const kmeans = await time("k-means k=5 (OURS)", 20, buffers.length, () => { for (const s of samples) kMeans(s, { seed: 1 }); });

// Hamming scan cost
const hashes = await listPinHashes({});
const target = hashes[0].phash;
const scan = await time(`Hamming scan, ${hashes.length} hashes`, 2000, 1, () => {
  let n = 0;
  for (const h of hashes) n += hammingDistance(target, h.phash);
  return n;
});
const scan500 = (scan * 500) / hashes.length;
console.log(`  ${"→ extrapolated to 500 hashes".padEnd(34)} ${scan500.toFixed(2)} ms`);

const sharpMs = decodeHash + decodeColor;
const oursMs = hash + kmeans + scan500;
console.log(
  `\n  sharp: ${sharpMs.toFixed(1)} ms  ·  our three algorithms: ${oursMs.toFixed(1)} ms` +
    `  ·  total ${(sharpMs + oursMs).toFixed(1)} ms per upload`,
);

// How many swatches does a sky-heavy image spend on one region?
console.log("\nPalette spread (are gradients split?):");
for (const [i, s] of samples.entries()) {
  const { swatches } = kMeans(s, { seed: 1 });
  // Count swatches within DeltaE 25 of the most dominant one.
  const { colorDistance } = await import("../lib/algorithms/color");
  const near = swatches.filter(sw => colorDistance(sw, swatches[0]) < 25).length;
  console.log(`  ${pins[i].title.slice(0, 26).padEnd(26)} ${near}/5 swatches cluster near the dominant colour`);
}

await (await getClient()).close();
