# Recommendation algorithms in PixSift

This is the guide to the "More like this" section on `/pin/[id]`. It covers what
a recommender actually *is*, the three that ship in this repo, the maths behind
each one, and how to write your own.

Code lives in [`lib/recommend/`](../lib/recommend/). Nothing else in the app
imports it, so you can rewrite all of it without breaking a single page.

---

## Table of contents

1. [The mental model](#1-the-mental-model)
2. [The contract](#2-the-contract)
3. [Algorithm 1 — Content-based (TF-IDF + cosine)](#3-algorithm-1--content-based-tf-idf--cosine)
4. [Algorithm 2 — Item-item collaborative filtering (Jaccard)](#4-algorithm-2--item-item-collaborative-filtering-jaccard)
5. [Algorithm 3 — Hybrid](#5-algorithm-3--hybrid)
6. [Choosing one](#6-choosing-one)
7. [How to write your own](#7-how-to-write-your-own)
8. [How to know if it's any good](#8-how-to-know-if-its-any-good)
9. [Traps that catch everyone](#9-traps-that-catch-everyone)
10. [Where to go next](#10-where-to-go-next)

---

## 1. The mental model

Every recommender, from ten lines to ten thousand, is the same three steps:

```
    represent  →  compare  →  rank
```

1. **Represent.** Turn each item into something a computer can do arithmetic on.
   A list of words. A set of user ids. A vector of 768 floats.
2. **Compare.** Define a *similarity function* between two representations.
   One number: bigger = more alike.
3. **Rank.** Score every candidate against the thing being viewed, sort, cut.

That's it. The entire field is arguing about step 1 and step 2.

The one idea worth internalising: **your choice of representation decides what
your algorithm is even capable of noticing.** If you represent a photo by its
title, you can never discover that two photos are both sunsets when neither
title says "sunset". No amount of clever maths in step 2 rescues a
representation that threw the signal away.

---

## 2. The contract

Every algorithm here is a pure function of this shape
([`lib/recommend/types.ts`](../lib/recommend/types.ts)):

```ts
type Recommender = (input: {
  subject: Pin                              // the pin being viewed
  candidates: Pin[]                         // everything else
  favoriteSets: Map<string, Set<string>>    // userId -> pinIds they saved
  now: number                               // injected, so tests are reproducible
}) => Array<{
  pin: Pin
  score: number     // higher is better
  reason: string    // human-readable "why"
}>
```

Three deliberate decisions in there:

- **Pure function.** No database calls, no `fetch`, no reading the clock. You can
  test it with a literal array and get the same answer every time.
- **`now` is a parameter.** Anything time-dependent is reproducible. A test that
  fails next Tuesday is worse than no test.
- **`reason` is required.** A ranker you can't explain is a ranker you can't
  debug. PixSift renders these under each suggestion, so a bad rank is visible
  immediately rather than after an hour of `console.log`.

Sorting, deduping, and cutting to `limit` happen once in
[`index.ts`](../lib/recommend/index.ts) — your algorithm only scores.

---

## 3. Algorithm 1 — Content-based (TF-IDF + cosine)

📄 [`lib/recommend/content-based.ts`](../lib/recommend/content-based.ts)

> **Question:** which pins are *about* the same thing as this one?
> **Signal:** the pins' own words. Zero user behaviour.

### The problem it solves

You want "similar pins" and all you have is text. The naive version — count
shared words — fails badly, because the most-shared words are the least
meaningful. Two pins both containing "the" and "a" are not related.

### Step 1: TF (term frequency)

How much is this pin about a word? Count occurrences, divide by document length
so a long description doesn't win by being long:

```
tf(term, pin) = occurrences(term, pin) / total_terms(pin)
```

"sunset" twice in a 10-word description → `tf = 0.2`.

### Step 2: IDF (inverse document frequency)

**This is the important part.** How *rare* is that word across the whole
catalogue? A word appearing in every pin carries no information. A word in only
two pins is a strong hint those two belong together.

```
idf(term) = ln( (N + 1) / (df(term) + 1) ) + 1
```

where `N` = total pins and `df` = how many pins contain the term. Worked, for
`N = 100`:

| term       | appears in | idf    | reading                        |
| ---------- | ---------- | ------ | ------------------------------ |
| `the`      | 100 pins   | ≈ 1.00 | worthless                      |
| `mountain` | 12 pins    | ≈ 3.04 | useful                         |
| `dolomites`| 2 pins     | ≈ 4.53 | very strong signal             |

The `+1`s are **smoothing**: they prevent division by zero for an unseen term
and keep `idf` strictly positive, so a term can never flip a score negative.

Multiply the two and you have the weight of each term for each pin:

```
weight(term, pin) = tf(term, pin) × idf(term)
```

Each pin is now a **vector** in a space with one dimension per distinct word.

### Step 3: cosine similarity

Compare two vectors by the **angle** between them, not the distance:

```
              A · B              Σ (aᵢ × bᵢ)
cos(A, B) = ───────────  =  ──────────────────────
            ‖A‖ × ‖B‖        √(Σaᵢ²) × √(Σbᵢ²)
```

For non-negative weights this lands in `0..1`. `1.0` = identical direction (same
topic), `0` = no shared terms.

Why angle and not Euclidean distance? Because **angle is length-independent**. A
two-word title and a 200-word essay about the same subject point the same way,
even though their vectors have wildly different magnitudes. Distance would call
them far apart; cosine correctly calls them similar.

### Trade-offs

| | |
|---|---|
| ✅ | Works from the very first pin — **no cold-start problem**. This is why the hybrid falls back to it. |
| ✅ | Fully explainable. "Both about *mountain*" is generated, not invented. |
| ✅ | Cheap: `O(N × terms)` to index, `O(N)` to score. |
| ❌ | **Can only find more of the same.** It will never surprise you. |
| ❌ | Blind to anything not in the text. Two photos of the same beach with unrelated titles look unrelated. |
| ❌ | Quality is capped by how carefully people write titles — which is to say, low. |

### Making it better

- **Add fields to the document.** [`documentText()`](../lib/recommend/text.ts) is
  one line. Tags, board names, and Cloudinary's auto-tagging all belong there.
  This is by far the highest-value change available.
- **Better stemming.** The stemmer here is ~5 lines. Porter or Snowball handles
  far more cases.
- **Bigrams.** "golden gate" as one term beats "golden" + "gate" separately.
- **Cache the IDF table.** It only changes when pins are added. Recomputing it
  per request is fine at eight pins and wasteful at eighty thousand.

---

## 4. Algorithm 2 — Item-item collaborative filtering (Jaccard)

📄 [`lib/recommend/collaborative.ts`](../lib/recommend/collaborative.ts)

> **Question:** people who saved this also saved…?
> **Signal:** behaviour only. It never looks at the image or the title.

### The key insight

Stop looking at the item. Look at *who liked it*.

Your favourites data is a matrix — users down the side, pins across the top,
a mark where someone saved something:

```
          pinA  pinB  pinC  pinD
   ann     ✓     ·     ✓     ·
   bo      ✓     ✓     ✓     ·
   cy      ✓     ✓     ·     ✓
   di      ·     ✓     ·     ✓
```

**Transpose it.** Now each *pin* is a set of the users who saved it:

```
savers(pinA) = {ann, bo, cy}
savers(pinB) = {bo, cy, di}
```

Similarity between two pins is now just **set overlap**. The image, the title,
the language it's written in — all irrelevant.

### Jaccard index

```
              |A ∩ B|            2 (bo, cy)
J(A, B) = ─────────────  =  ──────────────────── = 0.5
              |A ∪ B|        4 (ann, bo, cy, di)
```

**Why divide by the union?** This is the part people skip, and it's the whole
defence against a specific failure. Imagine `pinX` saved by 5,000 users:

| measure | pinX vs a niche pin with 4 savers |
| --- | --- |
| raw intersection | `4` — looks like a great match! |
| Jaccard | `4 / 5000 = 0.0008` — correctly, barely related |

With raw counts, the single most popular pin is "similar" to *everything*,
because it overlaps with everything. Normalising by the union kills that: a
popular pin's union is enormous, so each individual score stays small.

**This is the number one bug in hand-rolled collaborative filtering.** If your
recommendations are "the same three popular items on every page", you forgot to
normalise.

### Item-item vs user-user

Two ways to slice the same matrix:

- **User-user:** "find people like you, recommend what they liked." Intuitive,
  but user taste shifts weekly, so similarities go stale and must be recomputed
  constantly.
- **Item-item** (what's implemented): "find pins like this one." Item
  similarities are far more stable — a mountain photo is still like other
  mountain photos next month. You can compute them nightly and cache them.

Item-item is what Amazon published in 2003 and it's still the default choice for
this exact reason. Start here.

### Trade-offs

| | |
|---|---|
| ✅ | Finds genuinely **non-obvious** pairs. This is where "how did it know?" comes from. |
| ✅ | Works across languages and for images with no useful text at all. |
| ✅ | Gets better on its own as people use the app — no content work needed. |
| ❌ | **COLD START.** A new pin has no savers → scores `0` against everything → can never be recommended. Ever. |
| ❌ | With no favourites in the system it returns nothing useful at all. |
| ❌ | **Popularity bias** — needs the union-normalisation above, and even then leans mainstream. |
| ❌ | **Filter bubbles.** It reinforces existing clusters; niche content stays niche. |

### Making it better

- **Cosine instead of Jaccard** once you have ratings or weights rather than
  plain yes/no saves.
- **Weight by user activity.** Someone who saved 4,000 pins tells you much less
  per save than someone who saved 12. Divide their contribution by
  `√(their total saves)`.
- **Add implicit signals.** Views, dwell time, downloads, shares. A save is
  strong but rare; a view is weak but abundant.
- **Matrix factorisation** (SVD / ALS) is the real next step: it compresses the
  matrix into dense latent factors and can score pins that have *never* been
  co-saved, which fixes half the cold-start problem.

---

## 5. Algorithm 3 — Hybrid

📄 [`lib/recommend/hybrid.ts`](../lib/recommend/hybrid.ts)

> Content-based always works but is boring.
> Collaborative is inspired but dies without data.
> Use both. This is what production systems actually do.

```
final = w_content     · content
      + w_collab      · collaborative
      + w_popularity  · popularity
      + w_recency     · recency
```

Default weights: `0.45 / 0.35 / 0.10 / 0.10`.

### Normalisation is the whole game

**If you take one thing from this document, take this.**

Look at the natural ranges of the raw components:

| component | typical range |
| --- | --- |
| cosine | `0 – 1` |
| Jaccard | `0 – 0.3` in practice |
| save count | `0 – 400` |
| age in ms | `0 – 10¹²` |

Add those together and the weights are **decoration**. Whichever component
happens to produce the biggest numbers silently becomes the only signal that
matters, and your carefully-tuned `0.45` does nothing. Age in milliseconds would
outvote everything else by a factor of a trillion.

So every component is scaled to `0..1` against the best candidate *in that run*
before any weight is applied.

We use **max-normalisation** (`v / max`) rather than **min-max**
(`(v - min) / (max - min)`) on purpose:

> Min-max forces the worst candidate to `0` and the best to `1` — *even when all
> of them are equally irrelevant*. It manufactures a ranking out of noise.
> Max-normalisation keeps a genuine zero at zero, so "nothing matched" stays
> visible.

### Saturating popularity

```
popularity = saves / (saves + K)        K = 5
```

| saves | score |
| --- | --- |
| 0 | 0.00 |
| 5 | 0.50 |
| 20 | 0.80 |
| 400 | 0.99 |

Going 0 → 5 saves should matter enormously; 400 → 405 should matter almost none.
A raw count gets that exactly backwards. `K` is the point of diminishing
returns — set it near your median save count.

### Exponential recency decay

```
recency = 0.5 ^ (ageDays / halfLife)    halfLife = 30
```

One intuitive parameter: at exactly `halfLife` days old, a pin scores `0.5`.
60 days → `0.25`. Smooth, never negative, never hits zero.

### Cold-start fallback

```ts
const hasCollaborativeSignal = rawCollab.some((v) => v > 0)
const effective = hasCollaborativeSignal
  ? weights
  : { ...weights, content: weights.content + weights.collaborative, collaborative: 0 }
```

If nobody has co-saved anything, the collaborative component isn't merely
useless — it's *actively harmful*, because 35% of your score becomes noise. So
detect that and hand its weight to content-based.

**This is why the app ships with an empty database and still recommends
sensibly on day one.** As favourites accumulate, collaborative filtering fades
in automatically. No migration, no config change.

### Explaining the result

The blend reports which component actually drove each score, and that string
becomes the caption under the card. So you can look at `/pin/1` and *see*
whether it said "Both about mountain" or "3 people saved both" — which tells you
instantly whether the weights are doing what you think.

---

## 6. Choosing one

Set it in `.env` — no code change:

```bash
RECOMMENDER=content-based   # words only
RECOMMENDER=collaborative   # co-saves only
RECOMMENDER=hybrid          # default
```

Or per call, which is handy for side-by-side comparison:

```ts
relatedPins(pin, allPins, { strategy: "collaborative" })
```

| Your situation | Use |
| --- | --- |
| Brand new app, no users yet | `content-based` |
| Rich text/tags, little engagement | `content-based` |
| Lots of saves, sparse titles | `collaborative` |
| Real traffic, want the best results | `hybrid` |
| Debugging why something ranked | run all three and compare captions |

---

## 7. How to write your own

Three steps. Nothing outside `lib/recommend/` changes.

### Step 1 — write a `Recommender`

```ts
// lib/recommend/same-author.ts
import type { RecommendationInput, ScoredPin } from "./types"

export function sameAuthor({ subject, candidates }: RecommendationInput): ScoredPin[] {
  return candidates.map((pin) => ({
    pin,
    score: pin.authorId === subject.authorId ? 1 : 0,
    reason: pin.authorId === subject.authorId ? `Also by ${pin.author}` : "Different author",
  }))
}
```

Score every candidate. Return them all — don't sort, don't slice, don't filter.
`relatedPins` does that.

### Step 2 — register it

```ts
// lib/recommend/index.ts
import { sameAuthor } from "./same-author"

export const STRATEGIES = {
  "content-based": contentBased,
  collaborative,
  hybrid,
  "same-author": sameAuthor,   // ← add
} satisfies Record<string, Recommender>
```

`satisfies` makes TypeScript reject anything that isn't a valid `Recommender`,
so a wrong signature is a compile error rather than a runtime surprise.

### Step 3 — turn it on

```bash
RECOMMENDER=same-author
```

### If yours needs I/O

An embedding lookup, a vector search, a model call — anything async:

1. Make your recommender `async` and widen the `Recommender` return type to
   `ScoredPin[] | Promise<ScoredPin[]>`.
2. Make `relatedPins` `async` and `await` the strategy call.
3. Add `await` at its **one** call site in
   [`app/pin/[id]/page.tsx`](../app/pin/[id]/page.tsx). That page is a Server
   Component, so it can await freely.

---

## 8. How to know if it's any good

"Looks about right" is not a measurement. Two levels:

### Offline — fast, cheap, weak

Hide something you know the answer to, see if the algorithm finds it.

Take a user with 10 favourites. Hide 2. Ask for 10 recommendations from the
other 8. Did either hidden pin come back?

- **Precision@k** — of the `k` you showed, what fraction were relevant?
  *"Was what I showed any good?"*
- **Recall@k** — of all relevant items, what fraction did you show?
  *"Did I miss things?"*
- **MRR** (mean reciprocal rank) — `1/rank` of the first correct hit, averaged.
  Rewards getting it right at position 1 instead of position 9. Position matters
  enormously; nobody scrolls.

Because every algorithm here is a pure function with an injected `now`, you can
write this as a plain unit test with a literal array of pins.

### Online — slow, expensive, the truth

Offline metrics reward *predicting the past*. Only real users tell you whether
recommendations are good.

- **CTR** on the "More like this" section.
- **Save rate** from recommendations — a much stronger signal than a click.
- **A/B test**: split traffic between two `RECOMMENDER` values and compare.

### Also measure these, or you'll ship something worse

Accuracy alone leads you somewhere bad:

- **Coverage** — what % of your catalogue *ever* gets recommended? A recommender
  that only ever shows the top 50 pins has 0.1% coverage and is quietly useless
  for everyone else.
- **Diversity** — are the 12 suggestions 12 near-identical photos? Technically
  accurate, actually terrible. Look up **MMR (maximal marginal relevance)** to
  trade a little relevance for variety on purpose.
- **Novelty** — are you showing things people would have found anyway? A
  recommender that only surfaces the obvious adds no value.

---

## 9. Traps that catch everyone

1. **Adding unnormalised scores.** The single most common bug in a hybrid. See
   [§5](#normalisation-is-the-whole-game). Symptom: changing weights does nothing.
2. **Raw intersection instead of Jaccard.** Symptom: the same popular items on
   every page.
3. **Forgetting to exclude the subject.** It's a perfect match with itself and
   will rank first every time. `relatedPins` filters it once so no algorithm has
   to remember.
4. **Recommending things the viewer already saved.** Correct by similarity,
   useless as a suggestion. Filter against the viewer's own favourites.
5. **Trusting `Math.random()` for tie-breaks.** Non-deterministic output means
   irreproducible bugs. `relatedPins` breaks ties on `createdAt` instead.
6. **Recomputing everything per request.** Fine at eight pins. At eighty
   thousand, precompute the item-item matrix on a schedule.
7. **No `reason` string.** You will not be able to debug it. Ask anyone who has
   tried.
8. **Optimising accuracy alone.** See coverage and diversity above.

---

## 10. Where to go next

Roughly in order of value-per-effort for this app:

1. **Tags.** Add a `tags` field to `Pin` and put it in `documentText()`.
   Cloudinary can auto-tag on upload — see `lib/cloudinary.ts`. Biggest quality
   win available, and it's an afternoon.
2. **Filter out already-saved pins.** Two lines, immediately better.
3. **Track views**, not just saves. Implicit feedback is 100× more abundant.
4. **Cache the IDF table** and the item-item matrix.
5. **Perceptual hashing (pHash)** for genuine visual similarity — catches
   duplicates and near-duplicates that text can never see.
6. **CLIP embeddings.** Encode each image as a vector that captures what's
   actually *in* the photo, then use cosine similarity in that space. This is
   what modern visual search is, and it makes content-based filtering work
   without anyone writing a good title.
7. **Matrix factorisation (ALS)** for collaborative filtering at scale.
8. **Learning to rank.** Once you have click data, train a model to combine your
   signals instead of hand-tuning four weights.

### Reading

- Sarwar et al., *Item-Based Collaborative Filtering Recommendation Algorithms*
  (2001) — the foundational item-item paper.
- Linden et al., *Amazon.com Recommendations: Item-to-Item Collaborative
  Filtering* (2003) — the same idea at scale, very readable.
- Manning, Raghavan & Schütze, *Introduction to Information Retrieval*, ch. 6 —
  the definitive treatment of TF-IDF and cosine, free online.
- Radford et al., *Learning Transferable Visual Models From Natural Language
  Supervision* (2021) — CLIP.
