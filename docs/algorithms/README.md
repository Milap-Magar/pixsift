# The three algorithms

PixSift implements three algorithms by hand. This folder explains what each one
does, **why it was chosen over the alternatives**, and what it measurably
achieves.

| # | Algorithm | Question it answers | Code | Write-up |
|---|-----------|--------------------|------|----------|
| 1 | **Perceptual hash** (DCT-based) | What does this photo *look like*, as 64 bits? | [`phash.ts`](../../lib/algorithms/phash.ts), [`dct.ts`](../../lib/algorithms/dct.ts) | [01](./01-perceptual-hash.md) |
| 2 | **Hamming distance** + threshold | Are these two photos the same picture? | [`hamming.ts`](../../lib/algorithms/hamming.ts) | [02](./02-hamming-distance.md) |
| 3 | **k-means clustering** | What colours is this photo actually made of? | [`kmeans.ts`](../../lib/algorithms/kmeans.ts), [`color.ts`](../../lib/algorithms/color.ts) | [03](./03-kmeans-color.md) |

Measured results for all three: **[EVALUATION.md](./EVALUATION.md)** — regenerated
by `bun run db:evaluate`, so every number in it came out of the code rather than
out of a paragraph.

---

## What "implemented by hand" means here

This is the claim the project is graded on, so it is worth being exact about.

**Written from the mathematics, by us:** the discrete cosine transform, the
median threshold and bit packing, the population count and Hamming distance, the
union-find clustering, k-means++ initialisation, Lloyd's iteration, the
sRGB→CIELAB conversion, and the ΔE metric.

**Not written by us, and not part of the claim:** `sharp` decodes JPEG/PNG/WebP
files and resizes them. It appears in exactly one file,
[`pixels.ts`](../../lib/algorithms/pixels.ts), and does nothing else. Writing a
JPEG decoder would be a term's work on its own and would produce a worse decoder.

The separation is enforced structurally rather than by good intentions: every
algorithm file takes a `Float64Array` or a `Uint8ClampedArray` and returns a
value. None of them imports `sharp`, performs I/O, or reads the clock. That is
also why they are testable — and why the same clustering code runs on the server
for `/dashboard/duplicates` and again in the browser when you drag its threshold
slider, with no possibility of the two disagreeing.

There is, in any case, no `sharp` function that returns a perceptual hash or a
k-means palette. Those are not in its API.

---

## Why *these* three

They are not three unrelated picks. **Two of them are one pipeline and the third
is its complement**, and the reason for each is different.

### 1 and 2 are a pair

A perceptual hash on its own answers nothing. `9754f0f56f290a2a` is only useful
once you can say how far it is from another hash — and the choice of distance
is not arbitrary, because the bits are independent yes/no answers with no
ordering. That rules out Euclidean distance, cosine similarity and edit
distance for reasons spelled out in [02](./02-hamming-distance.md), and leaves
Hamming distance as the metric that matches the data.

So: **algorithm 1 produces a representation; algorithm 2 defines the geometry it
lives in.** Splitting them across two files and two write-ups reflects that they
fail independently — a correct hash with the wrong distance metric is a broken
detector, and so is the reverse.

### 3 covers what 1 and 2 deliberately throw away

Step one of the perceptual hash is *convert to greyscale*. Colour is discarded
on purpose, because it is the least stable property of a photograph — white
balance, filters and re-encoding all shift it while the composition stays put.
That is exactly what makes the hash robust.

But colour is also the single most useful thing to search a photo library by,
and "find me photos that are mostly this green" is a question no amount of
hashing can answer. k-means is not a third opinion about similarity; it recovers
the axis the first two algorithms had to give up.

That complementarity is visible in the product. On any pin's page:

- **Near-duplicates** (algorithms 1 + 2) — a resized re-upload of *this exact
  image*
- **Dominant colours** (algorithm 3) — five swatches, each linking to more
  photos in that colour

Two sections, two algorithms, two genuinely different questions.

---

## Why not a fourth, or a neural network

**Not more:** three is what the surfaces need, and a fourth would have to earn
its place by answering a question the first three cannot. The scope was
deliberately capped so that each one could be implemented properly, justified
against its alternatives, and measured — which is worth more than a longer list.

**Not a neural network.** CLIP or a pretrained CNN would beat all three at
"similar image" and would be the correct choice in production. It is the wrong
choice *here*, for two reasons that are worth stating plainly rather than
pretending the option does not exist:

1. **It would erase the contribution.** The interesting work would be a model
   download and a `.encode()` call. The project's premise is implementing the
   algorithms, and importing a 400MB model is the opposite of that.
2. **It cannot be explained line by line.** A DCT coefficient means something
   specific; embedding dimension 412 does not. Every ranking this project
   produces can be traced to a number a reader can check — which is why every
   recommendation in the UI carries a visible reason, and why the duplicate
   review page shows actual bit distances rather than a confidence score.

The upgrade path is real and is documented at the bottom of
[`similar-images.ts`](../../lib/recommend/similar-images.ts).

---

## How they run

```
UPLOAD ──► sharp decodes ──┬──► 32×32 greyscale ──► DCT ──► 8×8 ──► 64 bits ──► phash
                           │                                                      │
                           │                                          Hamming vs. library
                           │                                                      │
                           │                                            duplicate warning
                           │
                           └──► 96×96 RGB ──────► k-means (k=5) ──────────────► palette
                                                                                  │
                                                                    colour search, /colors
```

Timing is deliberate and differs by path:

- **Posting a file** — hashed *before* the upload, because the bytes are already
  in hand and a duplicate the user decides against should cost nothing: no
  Cloudinary asset to orphan, no row to roll back.
- **Saving a discovered photo** — analysed *after* the response, via Next's
  [`after()`](https://nextjs.org/docs/app/api-reference/functions/after). The
  image lives on someone else's server, and a download plus a decode should not
  sit in front of a click whose only job is "add this to my board".
- **Anything missed** — swept up by `bun run db:analyze`. Analysis is
  best-effort by design; a photo whose colours could not be clustered is still a
  photo, and refusing the post would punish the user for a failure they cannot
  see.

### Cost

Measured per image on the live corpus (`bun run db:benchmark`), averaged over
six real photographs:

| Stage | Whose code | Work | Time |
|---|---|---|---|
| Decode + resize to 32×32 | `sharp` | — | 7.7 ms |
| DCT + median + bit packing | **ours** | 65,536 multiply-adds | 0.2 ms |
| Decode + resize to 96×96 | `sharp` | — | 7.1 ms |
| k-means, k=5, 9,216 px | **ours** | ~23 iterations × 46k distances | 5.6 ms |
| Hamming scan over 500 pins | **ours** | 8,000 nibble lookups | 0.7 ms |
| | | | |
| `sharp` (decoding) | | | **14.7 ms** |
| All three algorithms | | | **6.5 ms** |
| **Total per upload** | | | **21.2 ms** |

**Decoding is two thirds of the cost, and none of it is ours.** The three
algorithms together account for about 6.5 ms. That is the justification for two
decisions that would otherwise look like premature optimisation: the palette is
computed from a 96×96 sample rather than a 12-megapixel original (which would
make k-means ~1,300× more expensive and dominate everything), and the duplicate
scan is an honest linear scan rather than an index, because at this scale an
index would be slower than the thing it replaced.

---

## Where this does not scale, and what would fix it

Stated here rather than discovered in a viva.

- **Duplicate detection is O(N) per query, O(N²) for the review page.** Fine at
  the current cap of 500 rows; useless at a million. The standard fix is
  multi-index hashing: split the 64 bits into *k* blocks and use the pigeonhole
  principle — two hashes within distance *d* must match exactly on at least one
  block when *k* > *d* — turning the scan into *k* indexed equality lookups. It
  changes how candidates are *fetched* and still uses the same distance to rank
  them, so it is an extension rather than a rewrite.
- **Colour search ranks in Node** over up to 500 palettes. Beyond that, the
  palette should become a vector and the ranking an approximate-nearest-neighbour
  index.
- **The hash is not rotation- or mirror-invariant.** Measured, quantified, and
  reported as a known limitation in [EVALUATION.md §3](./EVALUATION.md) rather
  than left out of the test set. The fix — hash all eight orientations and keep
  the smallest — costs 8× the hashing for a property this library does not need.

---

## Reproducing everything

```bash
bun run db:analyze      # hash + palette for every pin that lacks one
bun run db:evaluate     # regenerate EVALUATION.md from the live corpus
```

Both are safe to re-run and safe to interrupt.

Reproducibility is treated as a correctness property, not a nicety: k-means
seeds its PRNG from the image's own bytes and breaks ties by lowest index, so
the same photograph yields a bit-identical palette on every run, forever. The
evaluation script *asserts* this and throws rather than reporting if it ever
stops being true. Without it, no screenshot in the report would be reproducible
and no colour-search result repeatable.

---

## Related, but not part of the graded three

`lib/recommend/` holds three **recommenders** — TF-IDF/cosine, item-item
collaborative filtering, and a hybrid — which power the "More like this" section.
They work on text and on user behaviour, not on pixels, and they predate this
folder. See [`../ALGORITHMS.md`](../ALGORITHMS.md).

They are kept distinct on purpose. The three algorithms *here* answer questions
about **the image itself**; the recommenders answer questions about **what
people did with it**. A pin's page shows both, and the difference between the
two sections is the clearest demonstration of why both exist.
