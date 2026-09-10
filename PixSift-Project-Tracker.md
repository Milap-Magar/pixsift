# PixSift — Project Completion Tracker

**Project:** PixSift — web-based visual discovery platform (masonry feed)
**Course:** TU BCA Project III / CACS452 (6 credits)
**Graded core:** perceptual hash (pHash) + Hamming distance for near-duplicate detection, k-means for dominant-color extraction / color search
**Stack:** Next.js 15 (route handlers), MongoDB, Cloudinary (plumbing), NextAuth (plumbing), `sharp` (pixel access only)
**Mode:** solo

---

## How to use this document

Each phase has tasks and a **Definition of Done (DoD)** gate at the end. A task is not "done" because code exists — it is done when the DoD criterion is objectively verifiable. Do not move to the next phase until the current gate passes. Check the box only when a neutral reviewer (the "manager") could confirm the criterion by looking, running, or measuring — not by taking your word.

**Legend:** `[ ]` not done · `[~]` in progress · `[x]` done and verified

**The one rule that protects your grade:** the three algorithms are *your* deliverable. `sharp` may decode/resize/read pixels. No library may compute the hash, the distance, or the clusters for you. If a checked box hides an npm package doing the algorithm, the box is a lie and the defense will expose it.

---

## Phase 0 — Foundation & scaffolding

- [X] Next.js 15 project scaffolded, runs locally, committed to git with a real README
- [X] MongoDB connection working (Atlas or local), one test document written and read back
- [X] Cloudinary account configured, one manual test image uploaded and delivered via URL
- [~] NextAuth wired with at least one provider; can sign in and see a session
- [X] Data model drafted: `User`, `Image` (stores Cloudinary URL, pHash value, dominant-color palette, owner, timestamps) — `PinDoc` in `lib/db/pins.ts`; `phash`, `palette`, `colorFamilies`, `analyzedAt` with a JSON-Schema validator and partial indexes

**DoD gate 0:** A logged-in user exists in the DB, and a hard-coded image record can be created and fetched through a route handler. If you can't prove sign-in + one DB round-trip, do not proceed.

---

## Phase 1 — Upload pipeline

- [X] Upload route accepts an image, pushes it to Cloudinary, stores the returned URL in MongoDB
- [X] On upload, `sharp` extracts raw pixel data (resized to a fixed small grid, grayscale) — `lib/algorithms/pixels.ts`; length asserted in code (1024 for 32×32) rather than logged
- [X] Uploaded image appears in the feed, `/dashboard/pins` and `/profile`

**DoD gate 1:** Upload a real image from the browser → it lands in Cloudinary, its record lands in MongoDB, and you can read back its pixel matrix. The pixel extraction is the input to every algorithm below, so this gate is non-negotiable.

---

## Phase 2 — Algorithmic core (this is the graded project)

### 2a. Perceptual hash (pHash)
- [X] Grayscale + resize to 32×32 using `sharp` — `grayscaleMatrix()`
- [X] Discrete Cosine Transform implemented by hand — `lib/algorithms/dct.ts`, separable O(N³). **Verified against a naive O(N⁴) reference: max error 5.5e-12, energy preserved (Parseval), DC = N×mean**
- [X] Take top-left 8×8 low-frequency block, compute median (excluding DC), produce 64-bit hash — `lib/algorithms/phash.ts`
- [X] Hash stored on the pin at upload time — before the Cloudinary upload, so a rejected duplicate costs nothing

### 2b. Hamming distance / near-duplicate detection
- [X] Hamming distance implemented by hand (nibble popcount table over XOR) — `lib/algorithms/hamming.ts`
- [X] On upload, new hash compared against existing hashes; matches flagged in the add dialog with the image, the bit distance, and an "Add anyway"
- [X] Threshold chosen deliberately from a precision/recall sweep, justified at length in `lib/algorithms/hamming.ts` and `docs/algorithms/02-hamming-distance.md` §3

### 2c. k-means dominant-color extraction
- [X] k-means implemented by hand with k-means++ init, Lloyd's iteration, seeded PRNG — `lib/algorithms/kmeans.ts`
- [X] Runs on image pixels (RGB space), returns 5 dominant colours + proportions
- [X] Palette stored on the pin, plus a derived indexable `colorFamilies` array

**DoD gate 2 (the defense-critical gate):**
- [X] Two visually near-identical images are correctly flagged; unrelated ones are not. **Measured: 196 edited copies vs 2,912 unrelated pairs → precision 1.00, recall 0.91 at threshold 10.** See `docs/algorithms/EVALUATION.md`
- [X] Palette rendered as a proportional strip on every pin's page, so it can be checked against the photo at a glance. Reproducibility asserted: 14/14 bit-identical across runs
- [ ] You can open each of the three files and explain every line without reading it off the screen. If you can't narrate the DCT loop from understanding, you are not done — you are exposed.

---

## Phase 3 — Search & discovery features

- [X] Colour search at `/colors` — ranked by CIELAB ΔE weighted by each swatch's share, narrowed first through an indexed colour-family filter
- [X] Near-duplicates section on `/pin/[id]`, plus a full review queue at `/dashboard/duplicates` with a live threshold slider and 8×8 hash diffs
- [ ] Basic tag or category filter (optional, only if time remains)

**DoD gate 3:** Searching a color returns images whose palettes actually contain that color, ordered sensibly. A reviewer picks a color and agrees the top results match.

---

## Phase 4 — The feed (design-engineer polish)

- [X] Masonry feed layout, responsive, no layout shift on image load — CSS columns, 2→6 columns by breakpoint. **Every tile now reserves its exact aspect ratio before the image loads** (`pin-card.tsx`, matching `pixabay-result-card.tsx`); verified against the running wall: 18/18 tiles emit a reserved ratio, none fall back
- [X] Image detail view — palette strip, clickable swatches, near-duplicates, and the pin's own hash drawn as an 8×8 grid
- [~] Loading/skeleton states, empty states, hover interactions — `app/loading.tsx` (masonry skeleton on the same grid as the real wall), `app/error.tsx` (Next 16 `unstable_retry`, not the old `reset`), `app/not-found.tsx`, and the landing page's missing `empty` state are all in. **Still missing: a `loading.tsx` for `/dashboard`, `/colors`, `/discover` and `/search`** — the four other routes that wait on a network call
- [ ] One deliberate typographic + color-system pass so it reads as intentional, not templated

**DoD gate 4:** A stranger looking at the feed would guess "polished product," not "student assignment." This is your differentiation — but it is worth 0% of the algorithm grade, so it comes *after* gate 2 passes, never before.

---

## Phase 5 — Testing & result analysis (required by the report)

- [X] Test set GENERATED rather than hand-labelled: every real photo × 16 fixed edits, so labels are exact and reproducible — `scripts/evaluate-algorithms.mts`
- [X] Per-edit table (min / median / max distance, caught vs total) in `docs/algorithms/EVALUATION.md` §3
- [X] Precision & recall computed across thresholds 0–20 — EVALUATION.md §2
- [X] Threshold tuned and the decision documented, **including why 10 was chosen over the F1 maximum of 18** (margin against the negative distribution's left tail)
- [X] k-means quality measured: 23.4 mean iterations, ΔE drift 1.2 mean / 5.4 max under a different seed, reproducibility asserted — EVALUATION.md §4

**DoD gate 5:** You have a numbers table, not adjectives. "It works well" fails this gate. "Precision 0.9, recall 0.83 at threshold N" passes it. This section is what separates a CACS452 project from a CRUD app in the examiner's eyes.

---

## Phase 6 — Report (IEEE referencing)

- [ ] Ch 1 — Introduction / problem statement
- [ ] Ch 2 — Literature review (perceptual hashing, image similarity, clustering)
- [ ] Ch 3 — System analysis & design: use case diagram, class diagram, feasibility study
- [ ] Ch 4 — Implementation & testing: algorithm explanations, test cases, result analysis (from Phase 5)
- [ ] Ch 5 — Conclusion & future work
- [ ] IEEE references formatted correctly throughout

**DoD gate 6:** Every diagram matches the code that actually exists (not an aspirational design), and Ch 4's numbers match Phase 5's table exactly. Mismatches between report and demo are the fastest way to lose marks in defense.

---

## Phase 7 — Defense preparation

- [ ] Can demo the full flow live: upload → dedup flag → palette → color search
- [ ] Can whiteboard the DCT, Hamming, and k-means from memory
- [ ] Prepared answers for: "why pHash over other hashes?", "why this threshold?", "why k-means over other clustering?", "what breaks your dedup?"
- [ ] Backup: recorded demo video and seeded database in case live demo fails

**DoD gate 7 (final):** You can survive the question "show me where you implemented this, and explain it" for all three algorithms without hesitation. If any answer is "I used a library," that gate fails and so does the project's premise.

---

## Manager sign-off summary

| Phase | Milestone | Gate passed? |
|-------|-----------|:------------:|
| 0 | Foundation | [ ] |
| 1 | Upload pipeline | [ ] |
| 2 | Algorithmic core | [ ] |
| 3 | Search & discovery | [ ] |
| 4 | Feed polish | [ ] |
| 5 | Testing & analysis | [ ] |
| 6 | Report | [ ] |
| 7 | Defense prep | [ ] |

**Critical path (do in this order):** 0 → 1 → 2 → 5 → 6, with 3, 4, 7 slotted around them. Gate 2 and Gate 5 are the two that decide your grade. If time collapses, sacrifice feed polish (Phase 4) before you sacrifice test analysis (Phase 5).
