// Text handling shared by the content-based and hybrid recommenders.
//
// This is the unglamorous half of any text algorithm, and the half that most
// affects quality. Garbage tokens in, garbage recommendations out.

import type { Pin } from "@/lib/pins";

/**
 * Words that appear in so many documents they carry no signal. TF-IDF already
 * down-weights these automatically, but dropping them early keeps the vectors
 * small and stops them showing up in "reason" strings.
 */
const STOP_WORDS = new Set([
  // Articles, pronouns, auxiliaries
  "a", "all", "an", "and", "any", "are", "as", "be", "been", "being", "both",
  "but", "can", "could", "did", "do", "does", "each", "for", "had", "has",
  "have", "her", "here", "his", "how", "i", "if", "is", "it", "its", "just",
  "may", "might", "more", "most", "much", "must", "my", "no", "nor", "not",
  "one", "only", "or", "other", "our", "own", "same", "she", "should", "so",
  "some", "such", "than", "that", "the", "their", "them", "then", "there",
  "these", "they", "this", "those", "too", "very", "was", "we", "were", "what",
  "when", "where", "which", "while", "who", "why", "will", "with", "would",
  "you", "your",
  // Prepositions. These matter more than they look: a description like "a trail
  // winding THROUGH dense forest" would otherwise match anything else
  // containing "through", and the reason string reads "Both about through".
  "about", "above", "across", "after", "against", "along", "among", "around",
  "at", "because", "before", "behind", "below", "beneath", "beside", "between",
  "beyond", "by", "down", "during", "from", "in", "inside", "into", "near",
  "of", "off", "on", "onto", "out", "outside", "over", "past", "through",
  "throughout", "to", "toward", "towards", "under", "until", "up", "upon",
  "within", "without",
]);

/**
 * Very small suffix stripper so "mountain" and "mountains" become one term.
 *
 * This is a poor man's stemmer — a real one (Porter, Snowball) handles far more
 * cases. It's here because the difference between "matches mountains" and
 * "matches nothing" is usually just a plural.
 */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Lowercase, split on anything non-alphanumeric, drop noise, stem what's left. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .map(stem);
}

/**
 * Everything about a pin that counts as "content". Add tags here when you have
 * them — this one line is the highest-leverage change in the whole recommender.
 *
 * The author is deliberately NOT included. Mixing identity into the topic vector
 * makes every pin by one person look thematically related, and produces reasons
 * like “Both about ann”, which is nonsense. Author affinity is a separate signal
 * and belongs in its own component if you want it.
 */
export function documentText(pin: Pin): string {
  return `${pin.title} ${pin.description ?? ""}`;
}

export type Vector = Map<string, number>;

export function termFrequencies(terms: string[]): Vector {
  const counts: Vector = new Map();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  return counts;
}

export function magnitude(vector: Vector): number {
  let total = 0;
  for (const weight of vector.values()) total += weight * weight;
  return Math.sqrt(total);
}

/**
 * Cosine similarity: the angle between two vectors, in 0..1 for non-negative
 * weights. Length-independent, which is what we want — a long description
 * shouldn't beat a short one just for having more words.
 *
 * Also reports the single term that contributed most, so the UI can say
 * *why* two pins matched.
 */
export function cosineSimilarity(
  a: Vector,
  b: Vector,
): { score: number; topTerm: string | null } {
  // Iterate the smaller vector; the result is the same and the work is less.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];

  let dot = 0;
  let topTerm: string | null = null;
  let topContribution = 0;

  for (const [term, weight] of small) {
    const other = large.get(term);
    if (!other) continue;

    const contribution = weight * other;
    dot += contribution;

    if (contribution > topContribution) {
      topContribution = contribution;
      topTerm = term;
    }
  }

  if (dot === 0) return { score: 0, topTerm: null };

  const denominator = magnitude(a) * magnitude(b);
  return { score: denominator === 0 ? 0 : dot / denominator, topTerm };
}
