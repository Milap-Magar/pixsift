# Algorithm 1 — Perceptual hash (DCT-based, 64 bits)

**Code:** [`lib/algorithms/phash.ts`](../../lib/algorithms/phash.ts) ·
[`lib/algorithms/dct.ts`](../../lib/algorithms/dct.ts)
**Measured results:** [EVALUATION.md](./EVALUATION.md)

---

## 1. The problem

Reduce a photograph to a short, fixed-length value such that **two images that
look alike produce values that are alike**.

That last clause is the entire difficulty, and it is where the obvious tool
fails. A cryptographic hash answers a different question:

| | SHA-256 | Perceptual hash |
|---|---|---|
| Question | Are these the same **bytes**? | Are these the same **picture**? |
| One pixel changes | Every output bit changes | ~0 output bits change |
| Design goal | **Avalanche** — hide any relationship | **Locality** — preserve it |

Re-save a JPEG at quality 90 instead of 95 and every bit of its SHA-256 changes,
while the photograph is identical to a human eye. The avalanche property that
makes SHA-256 good at its job makes it useless at this one. We need the opposite
property, so we need a different construction.
dct - discrete cosine transform
---

## 2. The pipeline

```
   photograph
       │
       ▼
   ① resize to 32×32, greyscale     discard resolution and colour
       │
       ▼
   ② 2-D DCT                        separate broad shape from fine detail
       │
       ▼
   ③ keep the top-left 8×8          discard the fine detail
       │
       ▼
   ④ median of that block           derive a threshold from the image itself
       │
       ▼
   ⑤ one bit per coefficient        64 bits → 16 hex characters
```

Every step throws information away deliberately. What survives all five is the
coarse light-and-dark structure of the photograph — roughly what a person means
by "what it looks like".

---

## 3. Why each step is the step it is

### ① Resize to 32×32, greyscale

Resizing to a **fixed** grid is what makes the hash resolution-independent: a
4000px original and its 800px thumbnail both become the same 32×32 grid, so they
hash alike.

The resize uses `fit: "fill"`, which *ignores the aspect ratio* and squashes the
image into a square. That sounds like damage and is in fact the point — it makes
a 3:2 photo and a 1:1 crop of the same scene comparable. The alternatives both
break the property: `fit: "cover"` crops differently depending on the original's
proportions, and `fit: "contain"` pads with bars whose size depends on the
aspect ratio, and those bars would dominate the very low-frequency coefficients
the hash is built from.

Greyscale drops colour because colour is the *least* stable property of a
photograph — white balance, filters and re-encoding all shift it while the
composition stays put. Colour is not lost to the project: it is handled by
[algorithm 3](./03-kmeans-color.md), which is a better tool for it.

**Why 32 and not 8?** The DCT needs enough samples for its low-frequency
coefficients to be meaningful. Hashing an 8×8 image leaves the transform nothing
to concentrate.

### ② The discrete cosine transform

The DCT rewrites the grid as a sum of cosine waves of increasing frequency:

- **low frequency** → broad shapes: *"the top is bright, the bottom is dark"*
- **high frequency** → fine detail: single-pixel noise, JPEG artefacts, grain

Nothing is lost — the transform is invertible and outputs exactly as many
numbers as it takes in. What changes is *where the information sits*. Afterwards,
almost all of the visual identity of a photograph is concentrated in the handful
of coefficients in the top-left corner.

The formula, for a 1-D signal *f* of length *N*:

$$F(u) = c(u)\sum_{x=0}^{N-1} f(x)\cos\left[\frac{(2x+1)u\pi}{2N}\right]
\qquad c(u)=\begin{cases}\sqrt{1/N} & u=0\\ \sqrt{2/N} & u>0\end{cases}$$

Those scale factors make the transform **orthonormal**, which is what lets the
inverse use the same cosine table. The hash only compares coefficients against
each other, so a uniform rescaling would not change a single output bit — but
getting them right costs nothing and keeps this a correct DCT rather than a
DCT-shaped thing that works for one use.

#### Two 1-D passes, not one 2-D loop

Written directly, a 2-D DCT is four nested loops: for each of *N*² outputs, sum
over all *N*² inputs. That is **O(N⁴)** — 1,048,576 multiply-adds at *N* = 32.

But the 2-D basis *separates*: cos(*xu*)·cos(*yv*) is the product of two 1-D
bases. Transforming every row, then every column of that result, gives the
identical answer in **O(N³)** — 65,536 multiply-adds, **16× fewer**. This is the
same decomposition JPEG uses. It is the honest kind of optimisation: the
mathematics is unchanged, only the order of the arithmetic.

> **Verified, not assumed.** The separable implementation was checked against a
> naive O(N⁴) reference: maximum absolute error **5.5 × 10⁻¹²** (floating-point
> noise), total energy preserved to 12 decimal places (Parseval's theorem), and
> the DC coefficient exactly equal to *N* × mean brightness.

### ③ Keep the top-left 8×8

The lossy step, and the one that makes the hash *perceptual*. 64 of 1,024
coefficients survive — 6% of the numbers and very nearly all of the recognisable
structure.

Everything a typical edit perturbs — compression artefacts, noise, sharpening, a
small watermark — lives in the coefficients this step deletes. That is not a
happy accident; it is the reason the DCT is in the pipeline at all.

### ④ The median, not the mean

Both were considered, and the median is materially better.

The DC coefficient (index 0) is the image's mean brightness scaled by 32 — it is
routinely an order of magnitude larger than any other coefficient in the block. A
**mean** is dragged bodily by that one outlier, so nearly every other coefficient
lands below it and the hash collapses toward all-zeros, wasting most of its 64
bits. A **median** is a rank statistic: one enormous value moves it by one
position, not by its magnitude. We also exclude the DC term from the median
calculation outright.

Taking the threshold **from the image** rather than using a constant is what
makes the hash invariant to brightness and contrast. Brighten every pixel and
every coefficient scales together — the median scales with them, every
comparison lands the same way, and the bits do not move.

> **Verified:** a pure linear brightness/contrast change (×0.6 + 30 on every
> pixel) produces a Hamming distance of **0**. Additive noise of ±5 produces
> a distance of **2**.

### ⑤ One bit per coefficient

`coefficient > median → 1`. Emitted most-significant-first so that reading the
hex string left to right walks the block in the same order as the coefficients —
which is what lets the UI draw the hash as an 8×8 grid that lines up with the
block it came from.

Stored as 16 hex characters, so it is a plain indexed string in MongoDB, and
greppable, and readable in Compass, and directly comparable with the values
printed in this report.

---

## 4. An honest note about bit 0

Bit 0 is the DC coefficient compared against a median computed **without** it.
DC is the largest value in the block for essentially every real photograph, so
**bit 0 is 1 essentially always**.

> **Measured:** 1 in **200 / 200** test images.

The hash therefore carries ~63 informative bits, not 64.

This is stated plainly rather than hidden, because it is exactly the sort of
thing a viva question lands on. It is kept for two reasons:

1. It matches the widely-cited reference implementation (Krawetz, *"Looks Like
   It"*, 2011), so our hashes stay comparable with the literature.
2. A constant bit contributes 0 to **every** Hamming distance, so it cannot bias
   a comparison — it only fails to help.

Dropping it would buy one extra bit of resolution and cost comparability. The
trade was made deliberately in favour of comparability.

---

## 5. Why this and not the alternatives

| Approach | How it works | Why not here |
|---|---|---|
| **aHash** (average hash) | Shrink to 8×8, compare each pixel to the mean | Trivially cheap, and far more fragile. It operates in the *spatial* domain, so it has no way to separate structure from detail — a slight blur or a gamma shift moves many bits at once. It was implemented first and discarded. |
| **dHash** (difference hash) | Compare each pixel to its right-hand neighbour | Genuinely good, and more robust than aHash. But it encodes *local gradients*, which makes it sensitive to sharpening and to resampling filter choice — precisely the edits a photo library applies constantly. |
| **wHash** (wavelet) | Haar wavelet instead of DCT | Comparable accuracy. Chosen against for a specific reason: the DCT is the transform underlying JPEG, so its behaviour under JPEG re-compression — by far the most common edit a photograph undergoes — is *the same basis the compression itself works in*. The artefacts land in coefficients we have already discarded. |
| **CNN / CLIP embedding** | Learned feature vector | Better at *semantic* similarity, and the right production answer. Wrong here: it would erase the contribution the project is graded on, and embedding dimension 412 cannot be explained the way a DCT coefficient can. |

**pHash wins** because it is the cheapest construction that survives the edits
this application actually sees, and because every step of it can be explained
from first principles and checked by hand.

---

## 6. What it cannot do

Limitations, quantified rather than hedged. Full numbers in
[EVALUATION.md §3](./EVALUATION.md).

| Edit | Median distance | Caught? |
|---|---:|---|
| Re-encode, resize, format change, ±20% brightness, greyscale, blur, sharpen | 0–2 | ✅ always |
| Crop 5% | 6 | ✅ always |
| Crop 15% | 14 | ❌ mostly missed |
| Large corner watermark | 10 | ⚠️ 9 of 14 |
| **Rotate 90°** | **30** | ❌ never — by design |
| **Mirror horizontally** | **32** | ❌ never — by design |

**Rotation and mirroring are out of scope by design, not by oversight.** The
hash reads the image as a fixed 32×32 grid, so turning or flipping it moves
every feature to a different cell and produces an unrelated value — measured at
a median of 30–32 bits, statistically indistinguishable from two different
photographs. They are excluded from the precision/recall figures because
counting them as missed duplicates would misreport a deliberate design boundary
as a failure rate.

The fix is known and cheap to describe: hash all four 90° rotations plus their
mirrors at upload time and store the smallest, or compare against all eight at
query time. It costs 8× the hashing work for a property this library does not
currently need.

**It also says nothing about subject.** Two different sunsets with the same
composition will score as near-duplicates; two photos of the same person in
different poses will not. That is not a bug — it is what "perceptual hash"
means, and it is why the pin page carries a *separate* "More like this" section
driven by the text-based recommenders.

---

## 7. Complexity

| | Cost |
|---|---|
| Cosine table | O(N²), built once per size and memoised |
| DCT | O(N³) = 65,536 multiply-adds |
| Block + median + bits | O(64 log 64) |
| **Total per image** | **< 1 ms**, dwarfed by the ~15 ms decode |

---

## References

1. C. Zauner, *Implementation and Benchmarking of Perceptual Image Hash
   Functions*, MSc thesis, Upper Austria University of Applied Sciences, 2010.
2. N. Krawetz, "Looks Like It," *The Hacker Factor Blog*, 2011.
3. N. Ahmed, T. Natarajan and K. R. Rao, "Discrete Cosine Transform," *IEEE
   Transactions on Computers*, vol. C-23, no. 1, pp. 90–93, 1974.
