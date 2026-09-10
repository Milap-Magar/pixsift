# PixSift

A visual discovery platform: post photos, find them by colour, and never post
the same one twice.

Built on Next.js 16 (App Router), MongoDB, Cloudinary and Auth.js. **Three
image algorithms are implemented by hand** — a DCT-based perceptual hash,
Hamming-distance near-duplicate detection, and k-means dominant-colour
extraction.

---

## Getting started

```bash
bun install
cp .env.example .env       # then fill it in — see below
bun run dev
```

Open <http://localhost:3000>.

### Environment

| Variable | Needed for |
|---|---|
| `MONGODB_CONNECT_URL` | Everything. Pins live here. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Signing in (Google is the only provider) |
| `AUTH_SECRET` | Session encryption |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_SECRET` | Uploads and resized downloads |
| `PIXABAY_API_KEY` | Discovering photos to save |

The app degrades rather than breaking: without Cloudinary the upload tab
explains what's missing and the "paste a link" tab still works; without Pixabay
the discovery surfaces render nothing at all.

### Scripts

```bash
bun run dev             # dev server
bun run build           # production build
bun run lint

bun run db:check        # connection, indexes, and query plans
bun run db:seed         # seed the pins collection
bun run db:analyze      # hash + palette for every pin that lacks one
bun run db:evaluate     # regenerate docs/algorithms/EVALUATION.md
bun run db:benchmark    # where the time actually goes
```

---

## The algorithms

Full write-ups in **[`docs/algorithms/`](./docs/algorithms/)** — what each one
does, why it was chosen over the alternatives, and what it measurably achieves.

| # | Algorithm | Question it answers | Write-up |
|---|---|---|---|
| 1 | Perceptual hash (DCT) | What does this photo *look like*, as 64 bits? | [01](./docs/algorithms/01-perceptual-hash.md) |
| 2 | Hamming distance | Are these two photos the same picture? | [02](./docs/algorithms/02-hamming-distance.md) |
| 3 | k-means clustering | What colours is this photo made of? | [03](./docs/algorithms/03-kmeans-color.md) |

**Measured results:** [EVALUATION.md](./docs/algorithms/EVALUATION.md) —
regenerated from the live corpus by `bun run db:evaluate`, so every number came
out of the code rather than out of a paragraph.

Headline figures: **precision 1.00, recall 0.91** for near-duplicate detection
at a threshold of 10 bits out of 64, across 196 edited copies and 2,912
unrelated pairs. k-means converges in 23.4 iterations on average and is
bit-for-bit reproducible.

`sharp` decodes and resizes image files, in one file
([`pixels.ts`](./lib/algorithms/pixels.ts)), and does nothing else. It computes
none of the algorithms.

### Where you can see them working

| Surface | Algorithm |
|---|---|
| Duplicate warning when posting | 1 + 2 |
| **Near-duplicates** on a pin's page, with 8×8 hash diffs | 1 + 2 |
| **`/dashboard/duplicates`** — review queue with a live threshold slider | 1 + 2 |
| **Dominant colours** strip on a pin's page | 3 |
| **`/colors`** — browse the whole library by colour | 3 |
| Dashboard colour breakdown — *which colours do you actually shoot?* | 3 |

---

## Project layout

```
app/
  api/              route handlers (see /docs for the OpenAPI spec)
  colors/           browse by colour
  dashboard/        the signed-in workspace
  pin/[id]/         a pin we hold
  photo/[id]/       a discovered photo we don't
lib/
  algorithms/       ← the three algorithms, implemented by hand
  recommend/        text + collaborative recommenders ("More like this")
  db/pins.ts        the pins collection: schema, indexes, every query
docs/
  algorithms/       the write-ups and the measured results
  ROADMAP.md        what's built, what's broken, what's next
```

Two rules the codebase holds to:

- **Every pin query goes through `lib/db/pins.ts`.** The public/private rule is
  expressed once, as a filter (`visibleTo`), so a private pin cannot leak
  through a route handler or a page someone forgot to update.
- **Every algorithm is a pure function.** No I/O, no clock. That is why the same
  clustering code runs on the server for `/dashboard/duplicates` and again in
  the browser when you drag its threshold slider.

---

## Docs

- [`docs/algorithms/`](./docs/algorithms/) — the three algorithms
- [`docs/ALGORITHMS.md`](./docs/ALGORITHMS.md) — the *recommenders* (different thing)
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — defects and planned features
- [`docs/INFINITE-SCROLL.md`](./docs/INFINITE-SCROLL.md), [`docs/MASONRY.md`](./docs/MASONRY.md)
- `/docs` in the running app — interactive OpenAPI reference
