// ══════════════════════════════════════════════════════════════════════════
//  ALGORITHM 3 — "MORE LIKE THIS" FOR *BORROWED* IMAGES  (/photo/[id])
// ══════════════════════════════════════════════════════════════════════════
//
//  The other three recommenders in this folder rank pins we already hold: the
//  candidate set is "every row in the database", and the only question is how to
//  score it. Pixabay is the opposite problem. There are three million candidates,
//  they live on someone else's server, and there is NO similar-images endpoint —
//  the API can only answer keyword searches.
//
//  So this file does the two halves separately, which is how every large-scale
//  recommender is built:
//
//      RETRIEVAL   cheap, wide, approximate
//                  → turn the subject's tags into 3 keyword searches and pull
//                    ~90 plausible images back. Recall matters here, not order.
//
//      RANKING     expensive, narrow, precise
//                  → score those ~90 properly and keep the best 24.
//
//  Retrieval decides what you *can* show; ranking decides what you *do* show. A
//  result that retrieval never fetched can never be recommended, no matter how
//  good the scorer is — which is why the query set below matters more than the
//  weights.
//
//  ── The three queries ──────────────────────────────────────────────────────
//  Pixabay ANDs the words in `q`, so more words = narrower. That gives a natural
//  precision/recall ladder from one tag list:
//
//      "hallstatt austria alps"   ← 3 tags: near-duplicates of this exact photo
//      "hallstatt austria"        ← 2 tags: same subject, different photos
//      "austria"                  ← 1 tag:  same theme, lateral jumps
//
//  Mixing all three is deliberate. Query 1 alone returns fifty photos of the same
//  village from the same angle; query 3 alone drifts off-topic. Together the
//  ranked page opens with obvious matches and stays interesting as you scroll.
//
//  ── The score ──────────────────────────────────────────────────────────────
//      score = topic × (1 + 0.15·shape + 0.10·author)
//
//  `topic` is TF-IDF + cosine over the tags (the same maths as content-based.ts,
//  see docs/ALGORITHMS.md §3). `shape` and `author` are TIE-BREAKERS, and they're
//  multiplicative on purpose: they can shuffle the order of things that already
//  match by up to 25%, but they can never lift an image whose topic score is 0.
//  An additive blend would have handed every candidate a free 0.12 for merely
//  being a landscape, and `minScore` would then mean nothing.
//
//  ── Why tags, and not the pixels ───────────────────────────────────────────
//  Truly *visual* similarity ("this photo has the same composition") needs image
//  embeddings — CLIP, or a perceptual hash — plus a vector index. That's the
//  honest upgrade path, and it's sketched at the bottom of this file. Tags get
//  you most of the way for none of the cost, because Pixabay's tags are
//  contributor-written and unusually clean.
//
//  Cost: 3 cached HTTP requests (24h, shared by every visitor) + O(N·terms) CPU
//  over ~90 items. Nothing here needs a database.

import { searchImages, type PixabayImage } from "@/lib/pixabay";

import { cosineSimilarity, termFrequencies, tokenize, type Vector } from "./text";

export type ScoredImage = {
  image: PixabayImage;
  /** Higher is better. Comparable within one call only. */
  score: number;
  /** Human-readable "why" — shown under the tile so the ranking stays inspectable. */
  reason: string;
};

/** How much the tie-breakers may move a result, as a fraction of its topic score. */
export const SIMILARITY_BONUSES = {
  /** Same aspect ratio — a portrait next to a portrait reads as a set. */
  shape: 0.15,
  /** Same photographer — style, palette and gear tend to travel together. */
  author: 0.1,
} as const;

/**
 * Tags → the keyword queries that fetch candidates.
 *
 * Exported because this is the knob worth tuning first: widen it and you get
 * more variety at the cost of more API calls, narrow it and the page fills with
 * the same photo shot fifteen times.
 */
export function buildQueries(tags: string[]): string[] {
  const usable = tags.filter(Boolean).slice(0, 3);
  if (usable.length === 0) return [];

  const queries = [
    usable.join(" "), // narrowest — near-duplicates
    usable.slice(0, 2).join(" "), // same subject
    usable[0], // same theme
  ];

  // The three collapse into one when a photo only has one tag. Deduping keeps us
  // from spending three rate-limit slots on the identical request.
  return [...new Set(queries.filter(Boolean))];
}

/**
 * 1 when two images have the same proportions, falling off as they diverge.
 *
 * Compared in LOG space so the metric is symmetric: 16:9 vs 9:16 must score the
 * same either way round, which a plain ratio difference doesn't give you. ln(2)
 * ≈ 0.69 — a two-fold difference in aspect ratio — lands at ~0.31.
 */
function shapeSimilarity(a: PixabayImage, b: PixabayImage): number {
  const ratioA = a.width && a.height ? a.width / a.height : 0;
  const ratioB = b.width && b.height ? b.width / b.height : 0;
  if (!ratioA || !ratioB) return 0;

  return Math.max(0, 1 - Math.abs(Math.log(ratioA / ratioB)));
}

/** Everything that counts as this image's "content". Tags only — Pixabay has no prose. */
const documentText = (image: PixabayImage): string => image.tags.join(" ");

/**
 * The pure half: score an already-fetched pool against the subject.
 *
 * No I/O, no clock, no globals — hand it two literals in a test and the ranking
 * is fully determined. Sorting and cutting are the caller's job (see below).
 */
export function rankSimilar(subject: PixabayImage, candidates: PixabayImage[]): ScoredImage[] {
  if (candidates.length === 0) return [];

  const corpus = [subject, ...candidates];

  // ── Step 1: tokenize once per image ─────────────────────────────────────
  // Going through tokenize() rather than using the raw tags buys stemming
  // ("mountain" == "mountains") and drops the stop-words that sneak into
  // multi-word tags like "city at night".
  const tokensById = new Map<string, string[]>();
  for (const image of corpus) tokensById.set(image.providerId, tokenize(documentText(image)));

  // ── Step 2: document frequency across the pool ──────────────────────────
  // Note WHICH pool: these ~90 images were all retrieved by the subject's own
  // tags, so its main tag appears in nearly all of them and its IDF collapses
  // towards zero. That's the desired behaviour, not a bug — inside a pool of
  // beach photos, "beach" carries no information and "sunrise" carries all of it.
  const documentFrequency = new Map<string, number>();
  for (const tokens of tokensById.values()) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const total = corpus.length;
  const inverseDocumentFrequency = (term: string): number =>
    Math.log((total + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1;

  // ── Step 3: one tf-idf vector per image ─────────────────────────────────
  const vectors = new Map<string, Vector>();
  for (const image of corpus) {
    const tokens = tokensById.get(image.providerId) ?? [];
    const vector: Vector = new Map();

    // The guard is not paranoia: a Pixabay image can carry a single tag that
    // tokenize() throws away entirely ("the", "2020"), and `count / 0` would put
    // a NaN in the vector that poisons every cosine it touches.
    if (tokens.length > 0) {
      for (const [term, count] of termFrequencies(tokens)) {
        vector.set(term, (count / tokens.length) * inverseDocumentFrequency(term));
      }
    }

    vectors.set(image.providerId, vector);
  }

  const subjectVector = vectors.get(subject.providerId) ?? new Map();

  // ── Step 4: topic × tie-breakers ────────────────────────────────────────
  return candidates.map((image) => {
    const { score: topic, topTerm } = cosineSimilarity(
      subjectVector,
      vectors.get(image.providerId) ?? new Map(),
    );

    const shape = shapeSimilarity(subject, image);
    const sameAuthor = image.credit.name === subject.credit.name;

    const score =
      topic *
      (1 + SIMILARITY_BONUSES.shape * shape + SIMILARITY_BONUSES.author * (sameAuthor ? 1 : 0));

    return {
      image,
      score,
      reason: sameAuthor
        ? `More from ${image.credit.name}`
        : topTerm
          ? `Both tagged “${topTerm}”`
          : "Loosely related",
    };
  });
}

export type SimilarImagesOptions = {
  limit?: number;
  /** Drop anything at or below this. Keeps "More like this" honest when the pool is thin. */
  minScore?: number;
  /**
   * Ceiling on how many results one photographer may take.
   *
   * Without it a single contributor's 40-shot series of the same lake wins every
   * slot: those images share the subject's tags AND each other's, so they score
   * highest as a block. Diversity is a quality metric in its own right — a page
   * of near-identical winners is technically optimal and useless.
   */
  maxPerAuthor?: number;
};

/**
 * The whole thing: retrieval + ranking, ready for a Server Component to await.
 *
 * Never throws. A rate-limited or unreachable Pixabay produces an empty list,
 * because "no suggestions" is a fine outcome for a section the user is merely
 * scrolling past — it should not take the detail page down with it.
 */
export async function similarImages(
  subject: PixabayImage,
  { limit = 24, minScore = 0.02, maxPerAuthor = 3 }: SimilarImagesOptions = {},
): Promise<ScoredImage[]> {
  const queries = buildQueries(subject.tags);
  if (queries.length === 0) return [];

  // In parallel: three cached requests cost about as much wall-clock as one.
  const pages = await Promise.all(
    queries.map((query) =>
      searchImages({ query, perPage: 30 }).catch(() => ({ images: [], totalHits: 0 })),
    ),
  );

  // ── Dedupe the pool ─────────────────────────────────────────────────────
  // The three queries deliberately overlap, so the same image arrives up to
  // three times. Left in, it would occupy three slots on the page AND inflate
  // its own tags' document frequency, quietly distorting every other score.
  const pool = new Map<string, PixabayImage>();
  for (const page of pages) {
    for (const image of page.images) {
      if (image.providerId === subject.providerId) continue; // never recommend itself
      if (!pool.has(image.providerId)) pool.set(image.providerId, image);
    }
  }

  const ranked = rankSimilar(subject, [...pool.values()])
    .filter((scored) => scored.score > minScore)
    .sort((a, b) => b.score - a.score);

  // ── Diversity pass ──────────────────────────────────────────────────────
  const perAuthor = new Map<string, number>();
  const output: ScoredImage[] = [];

  for (const scored of ranked) {
    if (output.length >= limit) break;

    const author = scored.image.credit.name;
    const taken = perAuthor.get(author) ?? 0;
    if (taken >= maxPerAuthor) continue;

    perAuthor.set(author, taken + 1);
    output.push(scored);
  }

  return output;
}

// ── Where this goes next ────────────────────────────────────────────────────
//
//  1. VISUAL similarity. Tags describe the subject, never the composition. Run
//     each image through CLIP (or a pHash for the cheap version), store the
//     vector, and rank by cosine over embeddings instead of over words. That's
//     the only way "same colours, same framing, different subject" ever works.
//
//  2. Personalisation. `subject` is the sole input today, so every visitor sees
//     the same order. Blending in the viewer's saved tags — the collaborative
//     signal lib/recommend/collaborative.ts already computes — would tilt the
//     ranking toward what they actually save.
//
//  3. Learn the weights. `0.15` and `0.10` are considered guesses, not measured
//     values. Log which suggestion gets clicked, then fit them. See
//     docs/ALGORITHMS.md §8 for how to tell whether a change actually helped.
