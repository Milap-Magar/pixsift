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
- [ ] Data model drafted: `User`, `Image` (stores Cloudinary URL, pHash value, dominant-color palette, owner, timestamps)

**DoD gate 0:** A logged-in user exists in the DB, and a hard-coded image record can be created and fetched through a route handler. If you can't prove sign-in + one DB round-trip, do not proceed.

---

## Phase 1 — Upload pipeline

- [ ] Upload route accepts an image, pushes it to Cloudinary, stores the returned URL in MongoDB
- [ ] On upload, `sharp` extracts raw pixel data (resized to a fixed small grid, grayscale) — verified by logging the pixel array length
- [ ] Uploaded image appears in a raw list view (no styling yet, just proof of persistence)

**DoD gate 1:** Upload a real image from the browser → it lands in Cloudinary, its record lands in MongoDB, and you can read back its pixel matrix. The pixel extraction is the input to every algorithm below, so this gate is non-negotiable.

---

## Phase 2 — Algorithmic core (this is the graded project)

### 2a. Perceptual hash (pHash)
- [ ] Grayscale + resize to 32×32 using `sharp`
- [ ] Discrete Cosine Transform implemented by hand (your own code)
- [ ] Take top-left 8×8 low-frequency block, compute median, produce 64-bit hash
- [ ] Hash stored on the `Image` record at upload time

### 2b. Hamming distance / near-duplicate detection
- [ ] Hamming distance function implemented by hand (bit-count of XOR)
- [ ] On upload, new hash compared against existing hashes; matches under a threshold flagged
- [ ] Threshold chosen deliberately and written down with a one-line justification

### 2c. k-means dominant-color extraction
- [ ] k-means implemented by hand (init centroids, assign, recompute, iterate to convergence)
- [ ] Runs on image pixels (RGB space), returns k dominant colors + proportions
- [ ] Palette stored on the `Image` record

**DoD gate 2 (the defense-critical gate):**
- [ ] Two visually near-identical images (one resized/re-saved copy) are correctly flagged as duplicates; two unrelated images are not.
- [ ] Dominant-color palette for a test image visibly matches the image by eye.
- [ ] You can open each of the three files and explain every line without reading it off the screen. If you can't narrate the DCT loop from understanding, you are not done — you are exposed.

---

## Phase 3 — Search & discovery features

- [ ] Color search: user picks/enters a color → results ranked by distance to stored palettes (reuses your k-means output)
- [ ] Duplicate view: given an image, show its near-duplicates (reuses Hamming)
- [ ] Basic tag or category filter (optional, only if time remains)

**DoD gate 3:** Searching a color returns images whose palettes actually contain that color, ordered sensibly. A reviewer picks a color and agrees the top results match.

---

## Phase 4 — The feed (design-engineer polish)

- [ ] Masonry feed layout, responsive, no layout shift on image load
- [ ] Image detail view (palette shown, near-duplicates shown)
- [ ] Loading/skeleton states, empty states, hover interactions
- [ ] One deliberate typographic + color-system pass so it reads as intentional, not templated

**DoD gate 4:** A stranger looking at the feed would guess "polished product," not "student assignment." This is your differentiation — but it is worth 0% of the algorithm grade, so it comes *after* gate 2 passes, never before.

---

## Phase 5 — Testing & result analysis (required by the report)

- [ ] Test image set assembled: known duplicates, known non-duplicates, varied colors
- [ ] Test cases written in a table (input → expected → actual → pass/fail)
- [ ] Precision & recall computed for the duplicate detector across the test set
- [ ] Threshold tuned using the precision/recall numbers, decision documented
- [ ] k-means result quality noted (does palette match perception?)

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
