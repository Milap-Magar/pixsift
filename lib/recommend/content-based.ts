// ══════════════════════════════════════════════════════════════════════════
//  ALGORITHM 1 — CONTENT-BASED FILTERING  (TF-IDF + cosine similarity)
// ══════════════════════════════════════════════════════════════════════════
//
//  Question it answers:  "which pins are ABOUT the same thing as this one?"
//  Signal it uses:       the pins' own words. No user behaviour at all.
//
//  Three steps:
//
//  1. TF — term frequency. How often does a word appear in THIS pin?
//         "sunset" twice in a 10-word description => tf = 0.2
//
//  2. IDF — inverse document frequency. How rare is that word across ALL pins?
//         A word in every pin tells you nothing; a word in two pins is a strong
//         hint those two belong together.
//              idf(t) = ln( (N + 1) / (df(t) + 1) ) + 1
//         The +1s are smoothing: they stop a division by zero for unseen terms
//         and keep idf strictly positive.
//
//  3. Cosine — the angle between the two weight vectors. 1.0 = same direction
//         (same topic), 0 = nothing in common.
//
//  Strength:  works from the very first pin. No interaction history needed, so
//             it has no cold-start problem — this is why it's the fallback
//             inside the hybrid.
//  Weakness:  it can only ever find more of the same. Two photos of the same
//             beach with unrelated titles look completely unrelated to it, and
//             it will never surprise you.
//
//  Cost: O(N × terms) to build the index, O(N) to score. Fine to do per request
//        at this size; cache the IDF table once you have thousands of pins.

import {
  cosineSimilarity,
  documentText,
  termFrequencies,
  tokenize,
  type Vector,
} from "./text";
import type { RecommendationInput, ScoredPin } from "./types";

export function contentBased({ subject, candidates }: RecommendationInput): ScoredPin[] {
  const corpus = [subject, ...candidates];

  // ── Step 1: tokenize every document once ────────────────────────────────
  const tokensById = new Map<string, string[]>();
  for (const pin of corpus) tokensById.set(pin.id, tokenize(documentText(pin)));

  // ── Step 2: document frequency — in how many pins does each term appear? ─
  const documentFrequency = new Map<string, number>();
  for (const tokens of tokensById.values()) {
    // `new Set` matters: we're counting DOCUMENTS, not occurrences.
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const totalDocuments = corpus.length;

  const inverseDocumentFrequency = (term: string): number =>
    Math.log((totalDocuments + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1;

  // ── Step 3: build one tf-idf vector per pin ─────────────────────────────
  const vectors = new Map<string, Vector>();
  for (const pin of corpus) {
    const tokens = tokensById.get(pin.id) ?? [];
    const vector: Vector = new Map();

    if (tokens.length > 0) {
      for (const [term, count] of termFrequencies(tokens)) {
        // Normalising tf by document length stops long descriptions from
        // dominating purely by being long.
        vector.set(term, (count / tokens.length) * inverseDocumentFrequency(term));
      }
    }

    vectors.set(pin.id, vector);
  }

  const subjectVector = vectors.get(subject.id) ?? new Map();

  // ── Step 4: score every candidate against the subject ───────────────────
  return candidates.map((pin) => {
    const { score, topTerm } = cosineSimilarity(subjectVector, vectors.get(pin.id) ?? new Map());

    return {
      pin,
      score,
      reason: topTerm ? `Both about “${topTerm}”` : "Loosely related",
    };
  });
}
