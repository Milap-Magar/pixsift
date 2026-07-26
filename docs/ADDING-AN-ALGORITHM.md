# Adding an algorithm — a hands-on lab

[`ALGORITHMS.md`](./ALGORITHMS.md) explains the three recommenders that ship in
this repo and the maths behind them. **This document is the workshop**: you write
a fourth one, from an empty file to something running on `/pin/[id]`, and you see
it work.

Budget an hour. Everything you need is already in the repo — no new dependencies,
no new pages, no database changes.

> Read `ALGORITHMS.md` §1–2 first if you haven't. You need two ideas from it:
> _represent → compare → rank_, and the `Recommender` contract. The rest of that
> document you can read afterwards.

---

## Table of contents

1. [What you're building](#1-what-youre-building)
2. [The three files you'll touch](#2-the-three-files-youll-touch)
3. [Step 1 — the empty algorithm that compiles](#3-step-1--the-empty-algorithm-that-compiles)
4. [Step 2 — represent](#4-step-2--represent)
5. [Step 3 — compare](#5-step-3--compare)
6. [Step 4 — register and switch on](#6-step-4--register-and-switch-on)
7. [Step 5 — look at it, and be suspicious](#7-step-5--look-at-it-and-be-suspicious)
8. [Step 6 — a test you can run in two seconds](#8-step-6--a-test-you-can-run-in-two-seconds)
9. [Step 7 — blend it in](#9-step-7--blend-it-in)
10. [When your algorithm needs I/O](#10-when-your-algorithm-needs-io)
11. [The five mistakes you're most likely to make](#11-the-five-mistakes-youre-most-likely-to-make)
12. [Exercises, in increasing order of interest](#12-exercises-in-increasing-order-of-interest)

---

## 1. What you're building

A recommender called **`tag-overlap`**.

> **Question it answers:** which pins share the most _tags_ with this one, weighted
> so that a rare tag counts for more than a common one?
> **Signal:** the `tags` array on each pin. No text parsing, no user behaviour.

Why this one, and not something flashier? Three reasons, and they're the reasons
you'd pick it in a real project too:

- **The signal already exists.** Every pin saved from Pixabay arrives with real
  tags — look at `tags` in [`lib/db/pins.ts`](../lib/db/pins.ts). You are not
  inventing data to make your algorithm look good.
- **You can check it by eye.** Two photos tagged `mountain, snow, alps` obviously
  belong together. When the output is wrong you will _know_, immediately, which is
  the single most valuable property a learning project can have.
- **It teaches the one idea that transfers.** You'll implement rarity weighting
  (`idf`) and set-overlap normalisation by hand, in about fifteen lines. Those two
  moves reappear in every ranking system you will ever touch.

By the end, `/pin/some-id` will show suggestions captioned things like
_"Shares snow, alps"_, and you'll be able to switch between four algorithms with
one line in `.env`.

---

## 2. The three files you'll touch

```
lib/recommend/
├── types.ts             ← the contract. READ IT, don't change it.
├── index.ts             ← register your algorithm here (3 lines)
├── text.ts              ← tokenising/stemming helpers you may reuse
├── content-based.ts     ← worked example: TF-IDF over words
├── collaborative.ts     ← worked example: Jaccard over savers
├── hybrid.ts            ← worked example: weighted blend
└── tag-overlap.ts       ← ⬅ YOU WRITE THIS
```

Nothing outside `lib/recommend/` changes. That's not a coincidence — it's the
point of the contract. One page calls `relatedPins()`
([`app/pin/[id]/page.tsx`](../app/pin/[id]/page.tsx)) and it doesn't know or care
how many algorithms exist behind it.

Start by reading the contract for real:

```ts
// lib/recommend/types.ts
type Recommender = (input: {
  subject: Pin                              // the pin being viewed
  candidates: Pin[]                         // every other pin the viewer can see
  favoriteSets: Map<string, Set<string>>    // userId -> pinIds they saved
  now: number                               // injected, so tests are reproducible
}) => Array<{ pin: Pin; score: number; reason: string }>
```

Three rules follow from it, and every one of them will save you time:

| Rule | Why |
| --- | --- |
| **Score every candidate, return them all.** | `relatedPins()` sorts, filters `score > minScore`, breaks ties on `createdAt` and cuts to `limit` — once, for every algorithm. If you also sort and slice, you're fighting it. |
| **Be a pure function.** | No `fetch`, no `Date.now()`, no database. That's what makes step 6 (a two-second test) possible at all. |
| **Always write a real `reason`.** | It's rendered under each card. A ranker whose output you can't explain is a ranker you cannot debug — you'll spend the afternoon on `console.log` instead. |

---

## 3. Step 1 — the empty algorithm that compiles

Create the file with the smallest thing that satisfies the type. Resist the urge
to write the clever version first; get the wiring right while there's nothing to
debug.

```ts
// lib/recommend/tag-overlap.ts

import type { RecommendationInput, ScoredPin } from "./types";

export function tagOverlap({ subject, candidates }: RecommendationInput): ScoredPin[] {
  return candidates.map((pin) => ({
    pin,
    score: 0,
    reason: "not implemented",
  }));
}
```

That compiles, and it's a valid recommender: it says "everything is equally
irrelevant". Since `relatedPins()` drops anything scoring `0` by default, turning
it on right now would empty the "More like this" section — which is exactly what a
correct implementation of "I know nothing" _should_ do.

---

## 4. Step 2 — represent

Our representation is a **set of tags**, and a table of **how rare each tag is**.

Two details matter more than they look.

**Normalise the tags.** `"Snow"`, `"snow "` and `"snow"` are the same tag to a
human and three different strings to a `Set`. Every comparison you make later
inherits this decision, so make it once, at the top:

```ts
const tagSet = (pin: Pin): Set<string> =>
  new Set((pin.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean));
```

(`pin.tags` is optional — uploads and pasted links have none. `?? []` is the
difference between "no suggestions" and a crash.)

**Weight by rarity.** This is the whole reason the algorithm is worth writing.
Count how many candidates carry each tag, then score a tag by how _few_ pins have
it:

```ts
idf(tag) = ln( (N + 1) / (df(tag) + 1) ) + 1
```

where `N` is the candidate count and `df(tag)` is how many of them contain it. For
`N = 100`:

| tag | appears in | idf | reading |
| --- | --- | --- | --- |
| `nature` | 90 pins | ≈ 1.10 | nearly worthless — it's in everything |
| `mountain` | 12 pins | ≈ 3.04 | useful |
| `dolomites` | 2 pins | ≈ 4.53 | a strong hint those two belong together |

Sharing `dolomites` should count for about four times as much as sharing `nature`,
and this formula says so. The `+1`s are smoothing: they stop a division by zero
for an unseen tag and keep every `idf` positive, so no tag can ever push a score
negative.

If that formula looks familiar, it's the same `idf` as
[`content-based.ts`](../lib/recommend/content-based.ts). Two different
representations (words vs tags), one idea about rarity.

---

## 5. Step 3 — compare

Now the similarity function. The naive version is "count the shared tags", and
it's wrong in a specific, instructive way: a pin tagged with thirty things
overlaps with everything, so it wins every comparison by being verbose rather
than by being similar.

Divide by the size of the union — the **weighted Jaccard index**:

```
             Σ idf(t) for t in A ∩ B
J(A, B) = ────────────────────────────
             Σ idf(t) for t in A ∪ B
```

Here's the whole algorithm:

```ts
// lib/recommend/tag-overlap.ts
//
// "Which pins share the most TAGS with this one?"
//
// Tags are a far better signal than title words: someone wrote them to describe
// the image, and Pixabay supplies them for every saved photo. Rare shared tags
// count for more than common ones (idf), and the overlap is normalised by the
// union (Jaccard) so a pin with thirty tags can't out-rank a genuine match just
// by being verbose.

import type { Pin } from "@/lib/pins";

import type { RecommendationInput, ScoredPin } from "./types";

/** Tags, lower-cased and de-duplicated. Missing tags are simply an empty set. */
function tagSet(pin: Pin): Set<string> {
  return new Set((pin.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean));
}

export function tagOverlap({ subject, candidates }: RecommendationInput): ScoredPin[] {
  const subjectTags = tagSet(subject);

  // No tags on the pin being viewed → nothing to compare against. Say so with
  // zeros rather than guessing; `relatedPins` will show an empty section, which
  // is honest.
  if (subjectTags.size === 0) {
    return candidates.map((pin) => ({ pin, score: 0, reason: "This pin has no tags" }));
  }

  // ── Represent: every candidate's tag set, plus how rare each tag is ────────
  const sets = new Map<string, Set<string>>();
  const documentFrequency = new Map<string, number>();

  for (const pin of candidates) {
    const tags = tagSet(pin);
    sets.set(pin.id, tags);
    for (const tag of tags) {
      documentFrequency.set(tag, (documentFrequency.get(tag) ?? 0) + 1);
    }
  }

  const total = candidates.length;
  const idf = (tag: string): number =>
    Math.log((total + 1) / ((documentFrequency.get(tag) ?? 0) + 1)) + 1;

  // ── Compare: weighted Jaccard, subject vs each candidate ──────────────────
  return candidates.map((pin) => {
    const tags = sets.get(pin.id) ?? new Set<string>();

    let intersection = 0;
    let union = 0;
    const shared: string[] = [];

    for (const tag of new Set([...subjectTags, ...tags])) {
      const weight = idf(tag);
      union += weight;

      if (subjectTags.has(tag) && tags.has(tag)) {
        intersection += weight;
        shared.push(tag);
      }
    }

    const score = union === 0 ? 0 : intersection / union;

    // Name the rarest shared tags first — they're the ones that actually drove
    // the score, so this reads as an explanation instead of a list.
    const why = shared.sort((a, b) => idf(b) - idf(a)).slice(0, 3);

    return {
      pin,
      score,
      reason: why.length ? `Shares ${why.join(", ")}` : "No tags in common",
    };
  });
}
```

Read the `reason` line again. `shared.sort(by idf descending).slice(0, 3)` means
the caption tells you _which_ tags earned the rank, rarest first. When a
suggestion looks wrong, the caption usually explains why in five words.

---

## 6. Step 4 — register and switch on

```ts
// lib/recommend/index.ts
import { tagOverlap } from "./tag-overlap";

export const STRATEGIES = {
  "content-based": contentBased,
  collaborative,
  hybrid,
  "tag-overlap": tagOverlap,   // ← add
} satisfies Record<string, Recommender>;
```

`satisfies` is load-bearing: it makes TypeScript check every entry against
`Recommender`, so a wrong signature is a compile error here rather than a
mystery at runtime.

Then, in `.env`:

```bash
RECOMMENDER=tag-overlap
```

Restart `bun run dev` (env vars are read at boot) and open any pin saved from
Pixabay — those are the ones with tags. `/discover` is a quick way to find one.

---

## 7. Step 5 — look at it, and be suspicious

Open a pin and read the captions under "More like this". You are looking for four
specific failures:

| What you see | What it means |
| --- | --- |
| Empty section | The subject has no tags — that's uploads and pasted links. Correct behaviour, but worth confirming rather than assuming. |
| The same 3 pins on every page | You're probably not normalising. A raw intersection makes the most-tagged pins "similar" to everything. |
| Captions naming only `nature`, `background`, `wallpaper` | The `idf` weighting isn't doing its job — check you're weighting the intersection AND the union. |
| Perfect first result that is the pin itself | Can't happen here: `relatedPins()` filters the subject out before your algorithm sees it. Nice, isn't it. |

Then compare against another algorithm without changing any code:

```ts
// temporarily, in app/pin/[id]/page.tsx
const related = relatedPins(pin, all, { strategy: "content-based" });
```

Same page, same pin, different reasons underneath. That side-by-side is the
fastest way to develop a feel for what each signal can and cannot see.

---

## 8. Step 6 — a test you can run in two seconds

The contract's purity requirement pays off here. Your algorithm is a function
from plain objects to plain objects, so it needs no database, no server and no
test framework to exercise.

Create this file when you want it — it's a scratch harness, not part of the app:

```ts
// scripts/try-recommender.mts
//   node --import tsx scripts/try-recommender.mts
//
// No MongoDB, no Next.js, no network. Just the algorithm and eight literal pins.

import { tagOverlap } from "../lib/recommend/tag-overlap";
import type { Pin } from "../lib/pins";

const pin = (id: string, tags: string[]): Pin => ({
  id,
  title: id,
  imageUrl: `https://example.com/${id}.jpg`,
  author: "Test",
  authorId: "test@local",
  createdAt: 0,
  tags,
});

const subject = pin("subject", ["mountain", "snow", "alps"]);

const candidates = [
  pin("twin", ["mountain", "snow", "alps"]),          // identical → should win
  pin("close", ["mountain", "snow"]),                 // strong
  pin("rare-only", ["alps"]),                         // one RARE tag
  pin("common-only", ["nature"]),                     // one COMMON tag
  pin("verbose", ["mountain", ...Array.from({ length: 20 }, (_, i) => `t${i}`)]),
  pin("nature-1", ["nature"]),
  pin("nature-2", ["nature"]),
  pin("nature-3", ["nature"]),
  pin("unrelated", ["food", "kitchen"]),
];

const scored = tagOverlap({
  subject,
  candidates,
  favoriteSets: new Map(),
  now: 0,
}).sort((a, b) => b.score - a.score);

for (const { pin, score, reason } of scored) {
  console.log(`${score.toFixed(3)}  ${pin.id.padEnd(12)} ${reason}`);
}
```

Four assertions to make with your own eyes, in this order:

1. **`twin` scores highest.** If not, the maths is wrong — stop here.
2. **`rare-only` beats `common-only`.** Both share exactly one tag. If they tie,
   your `idf` isn't being applied. This is the test that proves rarity weighting
   works.
3. **`verbose` scores low** despite sharing `mountain`. That's the union
   normalisation earning its keep. Delete the `union +=` line and re-run to watch
   `verbose` climb — the fastest way to _feel_ why Jaccard divides.
4. **`unrelated` scores exactly 0**, so `relatedPins()`' `minScore` filter will
   drop it rather than padding the row with nonsense.

Change one thing, re-run, see the numbers move. That loop is worth more than any
amount of reading, this document included.

---

## 9. Step 7 — blend it in

A single-signal recommender is a teaching tool. Production systems blend, because
each signal is blind in a different direction: tags can't see what people like,
co-saves can't see a brand-new pin.

Look at [`hybrid.ts`](../lib/recommend/hybrid.ts) and note the one rule that
matters — **normalise before you weight**:

| component | natural range |
| --- | --- |
| tag Jaccard | `0 – 1` |
| co-save Jaccard | `0 – 0.3` in practice |
| save count | `0 – 400` |
| age in ms | `0 – 10¹²` |

Add those raw and your weights are decoration: age in milliseconds outvotes
everything else by a factor of a trillion. Every component is scaled to `0..1`
against the best candidate _in that run_ first. `ALGORITHMS.md` §5 has the full
treatment, including why max-normalisation (`v / max`) beats min-max here.

`makeHybrid` takes weights, so once you've read it you can compose your own blend
in a few lines and set `RECOMMENDER` to it. Exercise 4 below is exactly that.

---

## 10. When your algorithm needs I/O

An embedding lookup, a vector search, a model call — anything `async`. Three
edits, in this order:

1. Widen the return type in [`types.ts`](../lib/recommend/types.ts):
   `ScoredPin[] | Promise<ScoredPin[]>`.
2. Make `relatedPins()` in [`index.ts`](../lib/recommend/index.ts) `async` and
   `await` the strategy call.
3. Add `await` at its **one** call site in
   [`app/pin/[id]/page.tsx`](../app/pin/[id]/page.tsx). It's a Server Component,
   so it can await freely.

Two warnings from experience:

- **Don't call an API per candidate.** Five hundred candidates is five hundred
  requests and a page that takes a minute. Batch, or precompute.
- **Keep `now` injected anyway.** The moment your ranking reads the clock
  directly, your tests start failing on their own schedule.

For the shape of an I/O-bound ranker that already exists here, read
[`similar-images.ts`](../lib/recommend/similar-images.ts): it does three Pixabay
searches, then ranks the results in memory. Note that it is deliberately _not_ in
`STRATEGIES` — it ranks other people's images rather than our pins, so it isn't a
`Recommender` at all. Knowing when something doesn't fit your abstraction is part
of the skill.

---

## 11. The five mistakes you're most likely to make

1. **Sorting and slicing inside your algorithm.** `relatedPins()` already does
   both. Yours will silently win the argument and you'll lose the tie-breaking
   and `minScore` filtering that comes free.
2. **Forgetting `pin.tags` can be undefined.** Uploads have no tags. `?? []`.
3. **Weighting the intersection but not the union.** Half-applied normalisation
   is often worse than none, because it looks like it's working.
4. **Case-sensitive comparisons.** `"Snow" !== "snow"` and your overlap silently
   halves. Normalise once, at the boundary.
5. **A vague `reason`.** `"Similar"` tells you nothing at 11pm when the top
   suggestion is a photo of a sandwich. `"Shares snow, alps"` tells you exactly
   which signal misfired.

---

## 12. Exercises, in increasing order of interest

1. **Author affinity.** Score `1` for the same author, `0` otherwise (there's a
   worked version in `ALGORITHMS.md` §7). Fifteen lines, and it makes the
   registration flow muscle memory.
2. **Blend tags into the content-based recommender.** `documentText()` in
   [`text.ts`](../lib/recommend/text.ts) is one line — append `pin.tags`. Then ask
   the harder question: is it better? Compare captions on ten pins before and
   after, and write down what changed. This is the highest-value change available
   to this app and it's an afternoon.
3. **Filter out what the viewer already saved.** Correct by similarity, useless as
   a suggestion. `favoriteSets` is already in your input, and the viewer's id is
   on the page. Two lines, immediately better output.
4. **Your own hybrid.** `makeHybrid({ content: 0.3, collaborative: 0.3, tags: 0.4 })`
   — you'll have to extend `hybrid.ts` to know about a tag component. Watch what
   happens if you skip the normalisation step, then put it back.
5. **Cache the idf table.** It only changes when pins are added, and right now
   it's rebuilt on every request. Fine at fourteen pins; wasteful at fourteen
   thousand. Where would you put the cache, and what invalidates it?
6. **Do the overlap in MongoDB instead.** `findByTags()` in
   [`lib/db/pins.ts`](../lib/db/pins.ts) already scores tag overlap with a
   `$setIntersection` aggregation over an index. Compare the two approaches: what
   does the database do better, and what can it not do at all? (Hint: `idf`
   needs a corpus-wide count.) This question — push the work down, or pull the
   data up — is most of applied algorithm engineering.

---

## Where to go next

- [`ALGORITHMS.md`](./ALGORITHMS.md) §8 — how to tell whether your algorithm is
  actually any good: precision@k, recall@k, MRR, and why coverage and diversity
  matter as much as accuracy.
- [`ALGORITHMS.md`](./ALGORITHMS.md) §10 — the ordered list of what to build
  next for this app, from tags (cheap, big win) to CLIP embeddings (the real
  answer to visual similarity).
