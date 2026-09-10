# Algorithm 3 — k-means clustering for dominant-colour extraction

**Code:** [`lib/algorithms/kmeans.ts`](../../lib/algorithms/kmeans.ts) ·
[`lib/algorithms/color.ts`](../../lib/algorithms/color.ts) ·
[`lib/color-search.ts`](../../lib/color-search.ts)
**Measured results:** [EVALUATION.md §4](./EVALUATION.md)

---

## 1. The problem

Given every pixel of a photograph, produce the handful of colours a person would
name if you asked them what colour the photo is.

The two obvious approaches both fail, and *why* they fail is the argument for
the one that works.

**Average every pixel.** One colour out, and it is almost always mud. A photo of
a red sail on blue water averages to grey — a colour that appears nowhere in the
image and describes it not at all. The mean of a multi-modal distribution sits in
the empty space *between* the modes.

**Count the most common exact values.** A 12-megapixel photograph contains
hundreds of thousands of *distinct* RGB values, because sensor noise and JPEG
artefacts mean no two pixels of "the same" sky are byte-identical. The most
common exact value might occur forty times out of twelve million. You get a
histogram spike, not a dominant colour.

The real structure is that pixels form **clouds** in RGB space — a loose blob of
blues for the water, another of reds for the sail. *"Dominant colour"* means
*"centre of a large cloud"*. Finding cloud centres in a space is exactly what
clustering does.

---

## 2. The algorithm (Lloyd's)

```
   ① choose k starting centroids          ← k-means++, see §4
   ② ASSIGN   each pixel to its nearest centroid
   ③ UPDATE   move each centroid to the mean of its assigned pixels
   ④ repeat ②–③ until nothing moves       ← or the iteration cap is hit
```

Steps ② and ③ each provably reduce the total squared distance from pixels to
their centroids, so the loop **cannot oscillate forever** — it always converges.
What it converges *to* is a **local** minimum, not necessarily the best possible
one. That is what step ① is about.

> **Measured:** mean **23.4 iterations** to convergence against a cap of 40 —
> confirming the cap is a safety net that is never reached, not a limit cutting
> the clustering short.

### The distance is squared, with no square root

```ts
return dr*dr + dg*dg + db*db;   // no Math.sqrt
```

The square root is monotonic, so it cannot change **which** centroid is nearest.
This line runs *k* times per pixel per iteration — roughly 46,000 times per
image per round — so skipping it is free, correctness-preserving speed. (It does
mean these values are not ΔE and are never shown to anyone; user-facing
distances come from `colorDistance`, which works in CIELAB — see §6.)

### Convergence tests centroid *movement*, not assignment stability

```ts
const CONVERGENCE_EPSILON = 0.5;   // RGB units
```

The textbook test is "stop when no pixel changed cluster". At this scale there is
almost always one pixel on a boundary flipping between two nearly-equidistant
centroids, so the strict test would run all 40 iterations every time while the
palette stopped changing meaningfully around iteration eight.

---

## 3. Choosing k = 5

k is usually an awkward hyperparameter. **Here it is not**, and that is one of
the strongest arguments for using k-means in this application: the thing being
asked for is *"k representative colours, with how much of the image each
covers"* — which is literally k-means' output format. **k is the number of
swatches the design calls for.**

Five fills a palette strip without visible repeats. Below four, distinct regions
get merged; above six, clusters start splitting a single sky into shades of
itself.

Empty clusters — which happen when an image has fewer than k distinct colour
regions — are simply **dropped** from the palette. The common trick of re-seeding
an empty cluster onto the worst-fitting pixel is deliberately *not* used, because
it chases outliers. An empty cluster is a true fact about the image.

---

## 4. k-means++ initialisation

> Pick the first centroid at random, then pick each subsequent one with
> probability **proportional to its squared distance from the nearest centroid
> already chosen.**

In plain terms: **spread the starting points out, but let the data decide
where.**

This is not a micro-optimisation — it is what makes the result trustworthy. With
*k* uniformly random starting pixels, a photograph that is 70% sky will very
likely get three or four of its five centroids inside that one blue cloud. They
then split the sky into shades of itself while the sail, the sand and the subject
share one leftover swatch. The palette comes out obviously wrong, and because
Lloyd's algorithm only ever finds the *nearest* local minimum, no amount of
iterating rescues it.

k-means++ makes that outcome unlikely by construction, and it comes with a
proof: its expected error is within **O(log k)** of the optimal clustering
(Arthur & Vassilvitskii, 2007).

Implementation detail worth noting: the nearest-distance array is **updated
incrementally** as each centroid is chosen, rather than recomputing all *k*
distances for every pixel each round.

---

## 5. Reproducibility as a correctness property

A textbook k-means is random twice over — random initial centroids, and random
tie-breaking. That would mean **re-running it on the same photo could give a
different palette**, which would make every number in this report
unreproducible, every screenshot a one-off, and every colour-search result
unrepeatable.

Both sources of randomness are removed:

1. **A seeded PRNG** (mulberry32) replaces `Math.random()`. The seed is derived
   from the image's own bytes via FNV-1a, so the whole extractor is a pure
   function of the image: *same photo in, same palette out, forever*. The seed
   must also **differ between images** — a single fixed seed would bias
   k-means++ identically for every photograph.
2. **Deterministic tie-breaking.** Assignment uses a strict `<`, so the
   lowest-indexed centroid wins a tie. Arbitrary, but *fixed*.

> **Asserted, not assumed.** `scripts/evaluate-algorithms.mts` runs the
> clustering twice per image with the same seed and **throws** if the palettes
> differ. Result: **14/14 bit-identical.**

### How much does the answer depend on where it starts?

Re-running with a *different* seed and measuring, for each swatch, the ΔE to the
nearest swatch in the other run:

| | ΔE |
|---|---:|
| Mean palette drift | **1.2** |
| Worst palette drift | **5.4** |

A mean of ΔE 1.2 is at the threshold of human perceptibility. **The extracted
colours are essentially the same regardless of where the clustering starts**,
which is the evidence that k-means++ is finding a stable optimum rather than a
lucky local one.

---

## 6. Colour spaces: why clustering and ranking use different ones

**RGB is a storage format, not a perceptual one.** Equal steps in RGB are not
equal steps in apparent colour: the eye separates greens far more finely than
blues, so a distance of 30 in green is a visibly larger change than 30 in blue.
Plain Euclidean RGB distance therefore disagrees with people about which of two
colours is "closer" — and it disagrees worst exactly where photographs spend most
of their pixels: foliage, skin, sky.

**CIELAB** was designed to fix this. It is approximately *perceptually uniform*,
and its axes are meaningful: L\* is lightness, a\* runs green→red, b\* runs
blue→yellow.

So the two halves use different spaces, deliberately:

| Stage | Space | Why |
|---|---|---|
| **Clustering** (`kMeans`) | **RGB** | It is where the pixels already are. Converting 9,216 pixels to Lab before clustering, and centroids back afterwards, costs a transcendental function per channel per pixel to move cluster boundaries that the *share* weighting already dominates. The tracker also specifies RGB. |
| **Ranking** (`/colors`) | **CIELAB** | Ranking is the part a person judges directly: they pick a colour and immediately have an opinion about whether the results match. Here perceptual accuracy is the whole product. |

That split is a real trade with a real cost, and the honest version is: clustering
in Lab would produce slightly better-separated clusters on images with subtle
gradients. It is the most defensible piece of future work in this algorithm.

### Two details that are easy to get wrong

**Gamma.** The bytes in an image file are not proportional to light intensity —
they are warped so the 256 steps spread evenly across *perceived* brightness. Every
colour-space formula assumes linear light, so the warp must be undone first
(`linearize()`). Skipping this is the single most common bug in hand-written
colour conversion, and it is a quiet one: the numbers stay plausible and the
ranking is merely a bit wrong, most visibly in dark tones where the curve is
steepest.

**CIE76 over CIEDE2000.** The later formulas are more accurate, particularly for
saturated colours, at the cost of a page of correction terms. This project
*ranks* by distance and never reports an absolute perceptual claim, and ranking
is preserved by all three for the broad distances a palette search deals in. It
is the right trade here and the wrong one for, say, print proofing.

---

## 7. Why k-means and not the alternatives

| Approach | How it works | Why not here |
|---|---|---|
| **Median cut** | Repeatedly split the colour box along its longest axis. The classic palette algorithm — GIF quantisation used it. | Faster, no iteration. But it splits by **volume** rather than by **population**, so a handful of bright outlier pixels can claim a whole palette entry while the sky the photo is mostly made of gets one. |
| **Octree quantisation** | Build an octree of colours, merge the least populous nodes. | Excellent for *quantisation* (reproducing the image in N colours). We want *description*, not reproduction — and octree's merges are driven by tree structure, so its output colours are not centroids of anything perceptually meaningful. |
| **DBSCAN** | Density-based; finds arbitrary shapes, needs no k. | Genuinely appealing — until you notice it needs a density radius ε chosen instead. The right ε differs between a foggy landscape (one dense blob) and a neon sign (several sparse ones). Swapping "choose k" for "choose ε" is not a simplification, and unlike k, **ε has no natural value suggested by the use case**. |
| **Gaussian mixture model** | k-means' probabilistic generalisation; soft assignment. | Models smooth gradients better. Costs an order of magnitude more code and compute for a palette strip nobody will inspect that closely. |
| **Simple histogram binning** | Quantise RGB to a coarse grid, count. | Fast and crude. Bin boundaries are arbitrary lines through a continuum, so a gradient straddling two bins reports two colours where there is one. |

**k-means wins** because its output format *is* the requested output format,
because k is fixed by the design rather than guessed, and because with k-means++
its known weakness — sensitivity to initialisation — is measurably eliminated
(§5).

---

## 8. Cost, and why the image is downsampled first

k-means is O(iterations × k × pixels). Pixels are sampled on a **96×96 grid**
(9,216 pixels) rather than the original:

- **Speed.** Running over a 12-megapixel original would cost roughly **1,300×**
  more for a palette that is, in testing, indistinguishable.
- **Quality — and this is the part that isn't obvious.** Resizing *averages*
  neighbouring pixels, which suppresses sensor noise and JPEG blocking
  artefacts — exactly the single-pixel outliers that would otherwise pull a
  centroid off the colour a person actually sees. Downsampling is not only a
  speed hack; it improves the answer.

96 rather than the hash's 32, because colour needs more samples: a small but
vivid region (a red jacket in a landscape) has to survive downsampling as enough
pixels to hold a cluster of its own.

The resize uses `fit: "inside"`, preserving aspect ratio — unlike the hash's
`fit: "fill"`. The palette does not care about *position* at all, only about
which colours are present and in what proportion, and preserving the ratio keeps
each cluster's **share** faithful to the area it occupies in the photograph.

| Stage | Cost |
|---|---|
| k-means++ init | O(k × pixels) = ~46k distance computations |
| Each iteration | O(k × pixels) = ~46k |
| Total (23.4 mean iterations) | ~1.1M distance computations, **6.3 ms** |
| The `sharp` decode that feeds it | **7.1 ms** |

Measured per image over six real photographs. **The decode costs more than the
clustering does** — which is the clearest argument for downsampling: the
algorithm is not the bottleneck until you feed it a full-resolution image, at
which point it becomes the only thing that matters.

---

## 9. What it produces, and where it surfaces

```json
{ "r": 110, "g": 170, "b": 227, "hex": "#6eaae3", "share": 0.265 }
```

`share` is the fraction of sampled pixels in that cluster. The palette sums to
~1 (slightly under, when empty clusters are dropped).

Four surfaces in the product:

1. **Palette strip** on every pin's page — five bands, each as wide as its
   share. The cheapest possible proof the clustering ran: hold it next to the
   photograph and agree or disagree in a second.
2. **`/colors`** — pick a colour, get every photo ranked by how much of it is
   that colour. The search costs *no image processing at all*; it reads palettes
   clustered at upload time.
3. **Dashboard colour breakdown** — the distribution across a whole board.
   *"Which colours do you actually shoot?"* One photo's palette is a curiosity;
   the distribution across a hundred is a fact about the photographer.
4. **Swatch chips** on the pin page, each linking into `/colors`.

### The ranking function

Scoring a pin against a target colour is **not** "distance to the nearest
swatch". That ranks badly, and the reason is instructive: it ignores *how much*
of the photo that swatch covers. A landscape with one 2%-of-frame red flower
would beat a photograph that is entirely red, because both have a swatch at
ΔE 3 and the tiebreak never happens.

$$\text{score} = \sum_{s \in \text{palette}} \text{share}(s)\cdot\max\left(0,\ 1 - \frac{\Delta E(s,\ \text{target})}{60}\right)$$

Each swatch counts for as much of the image as it covers, scaled by how far its
colour is from the target, and dropped entirely past ΔE 60 — where a person
would call it a different colour. **Summing** rather than taking the best one
means a photo with three nearby shades of the target (what a real monochrome
photograph looks like after clustering) outranks one with a single exact hit and
four unrelated colours.

The cutoff matters: without it, a photo with five unrelated colours accumulates a
respectable score purely by having a full palette, and the ranking degrades into
*"which photos have the most colours in them"*.

The score's units are meaningful — 1.0 would be a photograph every pixel of
which is exactly the target colour, and 0.4 means roughly *"40% of this image is
close to what you asked for"*.

### Retrieval before ranking

`/colors` narrows candidates through an indexed `colorFamilies` array (nine
broad buckets) *before* scoring them by ΔE in Node. Coarse-then-fine — the same
retrieval/ranking split the Pixabay recommender uses. The pre-filter includes the
target's two **hue neighbours**, because the bucket boundaries are arbitrary
lines through a continuum: a target at hue 44° is "orange", but a photograph full
of hue 46° yellows is a genuinely good match sitting one bucket over. Filtering
on the single family would make results vanish as the picker crossed an invisible
line.

---

## 10. Known limitations

- **Gradients get split.** A sky that fades from pale to deep blue is one thing
  to a person and several clusters to k-means. Measured on the live corpus:
  **two or three of the five swatches** sit within ΔE 25 of the dominant colour
  on every image tested — i.e. up to 60% of the palette can be spent describing
  one region. A GMM would handle this better; so, partly, would clustering in
  Lab. It is the clearest quality limitation of the current implementation.
- **k is fixed at 5**, so a genuinely two-colour image reports five and a
  fifty-colour image reports five. Choosing k per image (via the elbow method or
  silhouette score) is possible but would make palette strips inconsistent
  between pins, which is a worse product for a marginally better model.
- **Small vivid regions can be lost.** A red flower occupying 0.5% of the frame
  may not survive the 96×96 downsample as enough pixels to hold a cluster.
- **Clustering in RGB, not Lab** — see §6. The most defensible piece of future
  work here.

---

## References

1. S. P. Lloyd, "Least Squares Quantization in PCM," *IEEE Transactions on
   Information Theory*, vol. 28, no. 2, pp. 129–137, 1982.
2. D. Arthur and S. Vassilvitskii, "k-means++: The Advantages of Careful
   Seeding," *ACM-SIAM SODA*, pp. 1027–1035, 2007.
3. Commission Internationale de l'Éclairage, *Colorimetry*, CIE Publication
   15:2004, 3rd ed., 2004.
4. IEC 61966-2-1:1999, *Multimedia systems and equipment — Colour measurement
   and management — Part 2-1: Default RGB colour space — sRGB*.
