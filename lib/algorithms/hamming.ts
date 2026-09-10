// ══════════════════════════════════════════════════════════════════════════
//  ALGORITHM 2 — HAMMING DISTANCE & NEAR-DUPLICATE DETECTION
// ══════════════════════════════════════════════════════════════════════════
//
//  ./phash.ts turns a photograph into 64 bits. This file is what makes those
//  bits useful: a distance between two hashes, a threshold that turns a
//  distance into a verdict, and the grouping that turns pairwise verdicts into
//  sets of duplicates.
//
//  ── The distance ─────────────────────────────────────────────────────────
//  The Hamming distance between two equal-length bit strings is the number of
//  positions at which they differ. For 64-bit hashes it is an integer from 0
//  (identical) to 64 (every bit flipped).
//
//      a  =  1 0 1 1 0 1 0 0
//      b  =  1 0 0 1 0 1 1 0
//      ⊕     0 0 1 0 0 0 1 0   →  2 bits set  →  distance 2
//
//  XOR sets exactly the differing bits, so "count the differences" becomes
//  "count the 1s in a ⊕ b" — the operation called a population count.
//
//  ── Why Hamming and not something cleverer ───────────────────────────────
//  Because of what the hash's bits MEAN. Each bit is one independent yes/no
//  question about the image ("is low-frequency coefficient 37 above the
//  median?"). The bits are not digits of a number and their positions carry no
//  ordering — bit 3 is not "worth more" than bit 40.
//
//  That rules out the obvious alternatives, and knowing WHY is the point:
//
//    · Euclidean distance on the hash read as an integer is meaningless. Two
//      hashes differing only in the top bit would score 2⁶³ apart while two
//      differing in all 63 low bits would score less. The metric would be
//      dominated by an arbitrary choice of which coefficient we happened to
//      emit first.
//    · Cosine similarity treats the bits as a vector's magnitude and direction.
//      A hash has no magnitude; scaling it is not a meaningful operation.
//    · Edit distance (Levenshtein) allows insertions and deletions, so it
//      would try to ALIGN two hashes by shifting them. Position i in one hash
//      and position i in the other are the same fixed coefficient, so the
//      alignment it searches for cannot exist. It is strictly more expensive
//      (O(n²) against O(n)) in exchange for an answer that is wrong.
//
//  Hamming distance is the metric that matches the data: it counts disagreeing
//  independent decisions, weights them all equally, and is a true metric (it
//  satisfies the triangle inequality), which is what makes the clustering at
//  the bottom of this file well-behaved.
//
//  ── Cost ─────────────────────────────────────────────────────────────────
//  One comparison is 16 table lookups. Finding every near-duplicate of one pin
//  in a library of N is O(N) comparisons — at N = 500 that is 8,000 lookups,
//  microseconds. That linear scan is honest at this project's scale and is
//  what the upload path uses.
//
//  It does not scale forever, and the report should say so: at millions of
//  images the standard answer is multi-index hashing — split the 64 bits into
//  k blocks and note that two hashes within distance d must agree exactly on at
//  least one block when k > d, which turns the scan into k indexed equality
//  lookups. That is a genuine upgrade path, not a rewrite, because it changes
//  only how candidates are FETCHED and still uses the distance below to rank
//  them.

import { HASH_BITS, HASH_HEX_LENGTH, isPerceptualHash } from "./phash";

/**
 * Population count for a 4-bit value: POPCOUNT[n] is how many 1 bits are in n.
 *
 * A nibble table rather than bit-twiddling because the hashes are stored as hex
 * strings, and one hex character IS one nibble. Comparing two hashes is then 16
 * character-pair lookups with no parsing, no BigInt, and no 32-bit-overflow
 * corner cases from trying to squeeze 64 bits into JavaScript numbers.
 *
 * JavaScript's bitwise operators coerce to signed 32-bit integers, so the
 * textbook "XOR the two integers and popcount the result" cannot be written
 * directly for a 64-bit value. Working a nibble at a time sidesteps that
 * entirely instead of splitting each hash into two halves and remembering which
 * is which.
 */
const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

/**
 * Number of differing bits between two 64-bit hashes, 0–64.
 *
 * Throws on a malformed hash rather than returning a plausible-looking number.
 * A silent 0 here would read as "these are identical" — the most dangerous
 * wrong answer this function could give, since it is what the upload path uses
 * to decide whether to warn about a duplicate.
 */
export function hammingDistance(a: string, b: string): number {
  if (!isPerceptualHash(a) || !isPerceptualHash(b)) {
    throw new Error(`hammingDistance: expected two ${HASH_HEX_LENGTH}-character hex hashes.`);
  }

  let distance = 0;
  for (let i = 0; i < HASH_HEX_LENGTH; i++) {
    // parseInt per character is safe here: isPerceptualHash has already
    // guaranteed every character is a hex digit.
    distance += POPCOUNT[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }

  return distance;
}

/**
 * Distance expressed as a 0–1 similarity, for anywhere a percentage reads
 * better than a bit count (progress bars, the dashboard, sorting alongside
 * scores from other algorithms).
 */
export function hammingSimilarity(a: string, b: string): number {
  return 1 - hammingDistance(a, b) / HASH_BITS;
}

// ── The threshold ───────────────────────────────────────────────────────────
//
// The distance is a fact. The threshold is a JUDGEMENT, and it is the single
// tunable number in this algorithm — so it is named, exported, and justified
// here rather than typed as a bare `10` at a call site.
//
// WHY 10, out of 64 — measured, not guessed. Full sweep and per-edit breakdown
// in docs/algorithms/EVALUATION.md; the numbers below come from it.
//
//   · Unrelated photographs cluster around a median distance of 32, which is
//     what theory predicts: if each bit were an independent coin flip, half of
//     64 would differ. Real photographs are not random, so the distribution has
//     a left tail — on our corpus the CLOSEST unrelated pair sits at 20.
//   · Every ordinary edit lands at or below 8: re-encoding (≤2), resizing
//     (≤4), format conversion (≤2), ±20% brightness (≤8), saturation, greyscale,
//     sharpening, blurring (≤2) and a 5% crop (≤8). A threshold of 10 clears all
//     of them with room to spare.
//   · At 10 the detector scores precision 1.00 and recall 0.91 on that corpus.
//
// WHY NOT HIGHER, given F1 keeps improving up to 18: because F1 is the wrong
// objective here. Precision only starts falling at 19, so F1 rises with recall
// alone and peaks near the top of the tested range — but a threshold of 18
// leaves 2 bits of margin against the nearest unrelated pair, on a 14-image
// corpus. That margin is a small-sample artefact: the negative distribution's
// left tail grows longer with every image added, so at library scale a
// threshold of 18 starts calling strangers' photographs copies of each other.
// 10 keeps 10 bits of margin.
//
// The residual cost is recall on exactly two edits — crops beyond ~15% and
// large watermarks — which change enough of the frame to be arguably a
// different picture. That trade is deliberate: this threshold drives a warning
// that interrupts someone mid-post, and the two errors are not symmetric. A
// missed duplicate costs one redundant pin; a false alarm tells a user their own
// original photograph is a copy of something else.
//
// Raising it trades precision for recall; lowering it does the reverse.

/** At or below this distance, two images are treated as the same picture. */
export const DUPLICATE_THRESHOLD = 10;

/**
 * A tighter band for "this is almost certainly the identical file, re-encoded".
 * Used to phrase the upload warning more strongly, never to change a decision.
 */
export const IDENTICAL_THRESHOLD = 4;

export type DuplicateVerdict = "identical" | "near-duplicate" | "distinct";

export function classify(distance: number): DuplicateVerdict {
  if (distance <= IDENTICAL_THRESHOLD) return "identical";
  if (distance <= DUPLICATE_THRESHOLD) return "near-duplicate";
  return "distinct";
}

export type HashedItem = { id: string; phash: string };

export type Match<T extends HashedItem> = {
  item: T;
  distance: number;
  similarity: number;
  verdict: DuplicateVerdict;
};

/**
 * Every candidate within `threshold` bits of `hash`, closest first.
 *
 * The linear scan discussed at the top of the file. `candidates` is whatever
 * the caller has already loaded — this function does no I/O, so it stays a pure
 * function that a test can drive with a literal array.
 */
export function findNearDuplicates<T extends HashedItem>(
  hash: string,
  candidates: readonly T[],
  opts: { threshold?: number; excludeId?: string; limit?: number } = {},
): Match<T>[] {
  const threshold = opts.threshold ?? DUPLICATE_THRESHOLD;
  const matches: Match<T>[] = [];

  for (const item of candidates) {
    if (item.id === opts.excludeId) continue;
    if (!isPerceptualHash(item.phash)) continue;

    const distance = hammingDistance(hash, item.phash);
    if (distance > threshold) continue;

    matches.push({
      item,
      distance,
      similarity: 1 - distance / HASH_BITS,
      verdict: classify(distance),
    });
  }

  // Closest first, then by id so the order is deterministic when two candidates
  // tie — otherwise the same query could return a different order per request
  // depending on how Mongo happened to lay out the page, which makes a
  // screenshot in the report impossible to reproduce.
  matches.sort((x, y) => x.distance - y.distance || x.item.id.localeCompare(y.item.id));

  return opts.limit ? matches.slice(0, opts.limit) : matches;
}

/**
 * Group a whole library into sets of mutually-near-duplicate images.
 *
 * Single-linkage clustering via union-find: A joins B's group when A is within
 * `threshold` of B, and groups merge transitively. Single-linkage is the right
 * choice here rather than a compromise — near-duplication genuinely IS
 * transitive in the cases that matter (an original, its thumbnail, and a
 * re-encode of that thumbnail all belong together even if the original and the
 * re-encode drift slightly further apart than the threshold).
 *
 * Its known failure mode is chaining: a run of images each just inside the
 * threshold can link two genuinely different photographs through a path of
 * intermediates. With a threshold in the empty gap described above, that path
 * does not exist in practice — but it is the reason the admin review queue at
 * /dashboard/duplicates shows the actual distances rather than only the groups.
 *
 * O(N²) comparisons. Deliberately capped by the caller, which passes at most
 * MAX_SCAN rows; at 500 that is 125,000 comparisons, still only a few
 * milliseconds.
 */
export function clusterDuplicates<T extends HashedItem>(
  items: readonly T[],
  threshold: number = DUPLICATE_THRESHOLD,
): Array<{ items: T[]; maxDistance: number }> {
  const usable = items.filter((item) => isPerceptualHash(item.phash));

  // Union-find. `parent[i]` is the index of i's representative; following the
  // chain to a self-parent finds the group.
  const parent = usable.map((_, index) => index);

  function find(index: number): number {
    while (parent[index] !== index) {
      // Path halving: point each node at its grandparent as we walk up, so
      // repeated finds over the same chain get cheaper instead of re-walking it.
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      if (hammingDistance(usable[i].phash, usable[j].phash) <= threshold) union(i, j);
    }
  }

  // Collect members by representative. This has to happen AFTER every union,
  // and each member has to be re-`find`ed rather than read out of `parent`
  // directly: a later union can re-point an earlier root, so a value recorded
  // against a root mid-loop may be filed under a node that is no longer one.
  const groups = new Map<number, T[]>();
  for (let i = 0; i < usable.length; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(usable[i]);
    else groups.set(root, [usable[i]]);
  }

  return (
    [...groups.values()]
      // A "group" of one is just an image with no duplicates — not a finding.
      .filter((members) => members.length > 1)
      .map((members) => ({ items: members, maxDistance: widestWithin(members) }))
      .sort((a, b) => b.items.length - a.items.length || a.maxDistance - b.maxDistance)
  );
}

/**
 * The largest pairwise distance inside one finished group — "how loose is this
 * cluster". Surfaced in the review queue because it is the number that reveals
 * chaining: a group whose widest pair sits far above the threshold was linked
 * through intermediates rather than by direct similarity.
 *
 * Computed here, over a settled group, rather than accumulated during the union
 * loop. Groups merge as the loop runs, so a running maximum would be filed
 * against a root that a later union can retire.
 */
function widestWithin<T extends HashedItem>(members: readonly T[]): number {
  let widest = 0;

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      widest = Math.max(widest, hammingDistance(members[i].phash, members[j].phash));
    }
  }

  return widest;
}
