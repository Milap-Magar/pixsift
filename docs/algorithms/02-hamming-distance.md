# Algorithm 2 — Hamming distance & near-duplicate detection

**Code:** [`lib/algorithms/hamming.ts`](../../lib/algorithms/hamming.ts)
**Measured results:** [EVALUATION.md](./EVALUATION.md)

[Algorithm 1](./01-perceptual-hash.md) turns a photograph into 64 bits. This is
what makes those bits useful: a **distance**, a **threshold** that turns a
distance into a verdict, and the **grouping** that turns pairwise verdicts into
sets.

---

## 1. The distance

The Hamming distance between two equal-length bit strings is the number of
positions at which they differ. For 64-bit hashes it is an integer from 0
(identical) to 64 (every bit flipped).

```
   a  =  1 0 1 1 0 1 0 0
   b  =  1 0 0 1 0 1 1 0
   ⊕     0 0 1 0 0 0 1 0   →  2 bits set  →  distance 2
```

XOR sets exactly the differing bits, so *"count the differences"* becomes
*"count the 1s in a ⊕ b"* — the operation called a **population count**.

### Implementation: a nibble table

```ts
const POPCOUNT = [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4];  // popcount of 0x0–0xF
```

Hashes are stored as 16 hex characters, and **one hex character is exactly one
nibble** — so comparing two hashes is 16 table lookups with no parsing, no
`BigInt`, and no overflow corner cases.

That last point is not incidental. JavaScript's bitwise operators coerce their
operands to **signed 32-bit integers**, so the textbook *"XOR the two integers
and popcount the result"* cannot be written directly for a 64-bit value. The
usual workaround is splitting each hash into two halves and remembering which is
which. Working a nibble at a time sidesteps the problem entirely and happens to
match the storage format exactly.

---

## 2. Why Hamming, and not something cleverer

This is the question worth being able to answer, and it comes down to **what the
bits mean**.

Each bit is one independent yes/no question about the image: *"is low-frequency
coefficient 37 above the median?"* The bits are **not digits of a number**, and
their positions carry **no ordering** — bit 3 is not worth more than bit 40.

That single fact rules out each alternative:

| Metric | Why it's wrong here |
|---|---|
| **Euclidean distance** on the hash read as an integer | Meaningless. Two hashes differing only in the top bit would score 2⁶³ apart, while two differing in all 63 low bits would score less. The metric would be dominated by an arbitrary choice of which coefficient we happened to emit first. |
| **Cosine similarity** | Treats the bits as a vector with magnitude and direction. A hash has no magnitude; scaling it is not a meaningful operation. |
| **Levenshtein / edit distance** | Allows insertions and deletions, so it tries to **align** two hashes by shifting them. But position *i* in one hash and position *i* in the other are the same fixed coefficient — the alignment it searches for cannot exist. Strictly more expensive (O(n²) vs O(n)) in exchange for a wrong answer. |
| **Jaccard similarity** | Sensible for *sets*. Our hashes are fixed-length vectors where a 0 is as informative as a 1; Jaccard would ignore every position where both are 0, discarding half the signal. |

**Hamming distance is the metric that matches the data**: it counts disagreeing
independent decisions, weights them equally, and is a true metric — it satisfies
the triangle inequality, which is what makes the clustering in §4 well-behaved.

---

## 3. The threshold — the one judgement call

The distance is a fact. The threshold is a **decision**, so it is named,
exported and justified in code rather than typed as a bare `10` at a call site.

```ts
export const DUPLICATE_THRESHOLD = 10;   // out of 64
```

### What the measurements say

From [EVALUATION.md](./EVALUATION.md) — 14 photographs × 16 edits, giving 196
in-scope positive pairs and 2,912 negative pairs:

| | min | 5th pct | median | 95th pct | max |
|---|---:|---:|---:|---:|---:|
| **Edited copies** (should be near) | 0 | 0 | 0 | 14 | 22 |
| **Different photographs** (should be far) | 20 | 26 | 32 | 38 | 42 |

Two things to read off this table.

**First, the bulk of the distributions are far apart.** The median edited copy is
at 0 and the median unrelated pair at 32. The value 32 is not a coincidence: if
each bit were an independent coin flip, half of 64 would differ — the observed
median matches the theoretical prediction for unrelated inputs.

**Second, they overlap at the extremes.** The worst in-scope duplicate reaches 22
while the closest unrelated pair is 20. So **no threshold achieves both perfect
precision and perfect recall on this corpus.** The choice is a genuine trade, not
the reading-off of an obvious gap.

That overlap is not spread evenly. The 75th percentile of all in-scope
duplicates is **2 bits**; the long tail above it comes almost entirely from two
edits — heavy cropping and a large corner watermark — which move enough of the
frame that the hash is arguably describing a different picture.

### The sweep

| threshold | TP | FN | FP | precision | recall | F1 |
|---:|---:|---:|---:|---:|---:|---:|
| 4 | 161 | 35 | 0 | 100.0% | 82.1% | 0.902 |
| 8 | 173 | 23 | 0 | 100.0% | 88.3% | 0.938 |
| **10 ←** | **178** | **18** | **0** | **100.0%** | **90.8%** | **0.952** |
| 14 | 187 | 9 | 0 | 100.0% | 95.4% | 0.977 |
| 18 | 195 | 1 | 0 | 100.0% | 99.5% | **0.997** |
| 20 | 195 | 1 | 3 | 98.5% | 99.5% | 0.990 |

### Why 10, when F1 peaks at 18

Because **F1 is the wrong objective for this decision**, and saying "we picked
the best F1" would be the wrong answer to give for this table.

Precision stays at 100% all the way to threshold 19, so F1 rises with recall
alone and peaks near the top of the tested range. Taking 18 would buy 8.7 points
of recall — and would leave only **2 bits of margin** before the closest
unrelated pair in this corpus, at 20.

**That margin is the number that matters, and 14 photographs is far too small a
sample to spend it.** The minimum of the negative distribution is the left tail
of a distribution that gets *longer* as the library grows: with 2,912 negative
pairs the minimum is 20, but with thousands of images, unrelated pairs at 18 and
19 stop being unlikely and become routine. A threshold of 18 would then start
flagging strangers' photographs as copies of each other. Threshold 10 keeps
**10 bits of margin** against the same corpus.

### The asymmetry that settles it

What 10 costs is recall on exactly two edits, at 90.8% overall. What it buys is a
false-positive rate that should survive the library scaling.

For a warning that **interrupts someone mid-post**, the two errors are not
equally expensive:

- A **missed duplicate** costs one redundant pin in that user's own board.
- A **false alarm** tells a user their own original photograph is a copy of
  something else.

The second is much worse, so the conservative end of the range wins.

### And it is a warning, not a block

The UI reflects the fact that a 91%-recall classifier is a good guess, not an
oracle. A match pauses the post, shows the matching image, shows the actual bit
distance, and offers **"Add anyway"**. Two frames from the same burst are
genuinely near-identical and a photographer may well want both.

---

## 4. From pairs to groups

`/dashboard/duplicates` shows *sets* of duplicates, not pairs. That needs
clustering, done with **single-linkage via union-find**:

```
A joins B's group when distance(A,B) ≤ threshold, and groups merge transitively.
```

**Single-linkage is the right choice here rather than a compromise.**
Near-duplication genuinely *is* transitive in the cases that matter: an original,
its thumbnail, and a re-encode of that thumbnail all belong together even if the
original and the re-encode drift slightly further apart than the threshold.

Its known failure mode is **chaining** — a run of images each just inside the
threshold can link two genuinely different photographs through a path of
intermediates. With a threshold in the safe range, that path does not exist in
practice. It is nonetheless why the review page reports each group's **widest
internal pair** alongside the group itself: a group whose widest pair sits far
above the threshold was linked through intermediates rather than by direct
similarity, and that is visible at a glance.

Union-find uses **path halving** — each node is pointed at its grandparent
during a find — so repeated lookups over the same chain get cheaper rather than
re-walking it.

> **Implementation note.** The widest-pair figure is computed in a second pass
> over each finished group, not accumulated during the union loop. Groups merge
> as the loop runs, so a running maximum filed against a root can end up
> attached to a node that a later union has retired. This was a real bug in the
> first version.

---

## 5. Complexity, and where it stops working

| Operation | Cost | At current scale |
|---|---|---|
| One comparison | 16 table lookups | ~0 |
| Find duplicates of one image | **O(N)** | 500 pins → 8,000 lookups, < 1 ms |
| Cluster the whole library | **O(N²)** | 500 pins → 125,000 comparisons, a few ms |

The linear scan is honest at this project's scale and is what the upload path
uses. **It does not scale forever, and the report should say so.**

At millions of images the standard answer is **multi-index hashing**: split the
64 bits into *k* blocks and apply the pigeonhole principle — two hashes within
distance *d* must agree *exactly* on at least one block when *k* > *d*. That
turns the scan into *k* indexed equality lookups. It is an extension rather than
a rewrite, because it changes only how candidates are **fetched** and still uses
the distance above to **rank** them.

---

## 6. Seeing it work

`/dashboard/duplicates` exists to make this algorithm inspectable rather than
merely correct:

- every near-duplicate group in the library
- the actual Hamming distance between each pair
- both hashes drawn as **8×8 grids with differing bits in red** — two
  near-duplicates visibly share a pattern; two unrelated photos visibly do not
- a **live threshold slider** that re-clusters the entire library as you drag it

The slider re-runs `clusterDuplicates` **in the browser**, on hashes the page
already sent down (16 characters each — about 8KB for 500 images). This is only
possible because the algorithm is a pure function with no I/O and no clock: the
identical code runs on the server for the first render and in the browser for
every subsequent step, and the two cannot disagree.

Dragging it is also how the threshold was chosen in the first place, before the
numbers in EVALUATION.md confirmed it.

---

## References

1. R. W. Hamming, "Error Detecting and Error Correcting Codes," *Bell System
   Technical Journal*, vol. 29, no. 2, pp. 147–160, 1950.
2. M. Norouzi, A. Punjani and D. J. Fleet, "Fast Search in Hamming Space with
   Multi-Index Hashing," *IEEE CVPR*, 2012.
3. R. E. Tarjan, "Efficiency of a Good But Not Linear Set Union Algorithm,"
   *Journal of the ACM*, vol. 22, no. 2, pp. 215–225, 1975.
