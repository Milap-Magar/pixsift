// "Photos you might want to add" — a row of Pixabay results on the dashboard.
//
// ── Why this is on the dashboard at all ──────────────────────────────────
// The hardest moment in a photo app is the empty one: you open your board, you
// have nothing to post, and the only thing on screen is a button that asks you
// to go and find something. This row answers that by having already gone and
// found something.
//
// The query isn't generic. It's built from the words that are actually
// distinctive about THIS person's board (see `boardKeywords`), so someone whose
// pins are mountains and fog gets mountains and fog rather than "popular
// photos". A suggestion that reads as a suggestion beats a shelf of stock
// imagery.
//
// ── Failing quietly is the requirement ───────────────────────────────────
// Pixabay may be unconfigured, rate-limited, or down, and none of that is a
// reason for a dashboard to break. Every failure path here renders nothing at
// all — a missing row is invisible, whereas an error card would draw attention
// to an outage the user cannot act on.

import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

import PixabayResultCard from "@/app/components/pixabay-result-card";
import type { SavedPin } from "@/lib/db/pins";
import { isPixabayConfigured, searchImages } from "@/lib/pixabay";
import { documentText, tokenize } from "@/lib/recommend/text";

/** How many suggestions to show. One tidy row at most widths. */
const SUGGESTIONS = 8;

/**
 * The words that best describe this board, most common first.
 *
 * Deliberately simple: term frequency over the user's own pins, minus a stop
 * list, take the top few. It is NOT TF-IDF, and the reason is worth stating —
 * TF-IDF finds terms that are distinctive *within a corpus*, which is the right
 * tool for the topic chips on /discover where the corpus is the whole gallery.
 * Here the corpus is one person's board and the question is "what does this
 * person photograph", for which raw frequency is the correct and simpler
 * answer.
 */
function boardKeywords(pins: SavedPin[], limit = 3): string[] {
  const counts = new Map<string, number>();

  for (const pin of pins) {
    // Per-pin `Set`, so a word repeated in one description doesn't outvote a
    // word that appears once in each of five pins. We want breadth of interest,
    // not one enthusiastic caption.
    for (const term of new Set(tokenize(documentText(pin)))) {
      if (term.length < 4) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

export default async function DiscoverRow({
  pins,
  signedIn,
}: {
  pins: SavedPin[];
  signedIn: boolean;
}) {
  if (!isPixabayConfigured()) return null;

  const keywords = boardKeywords(pins);

  // Pixabay ANDs the words in `q`, so joining three keywords would ask for
  // photos that are all three at once and usually return nothing. One word is
  // the right query for a suggestion row; the fallback covers a brand-new
  // board with no text to learn from yet.
  const query = keywords[0] ?? "landscape";

  let images;
  try {
    const result = await searchImages({ query, perPage: SUGGESTIONS });
    images = result.images;
  } catch {
    // Rate-limited, misconfigured, or down. Render nothing.
    return null;
  }

  if (!images.length) return null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-xl">
            <Compass className="size-5" />
            {keywords.length ? (
              <>
                More <span className="italic">{query}</span> to add
              </>
            ) : (
              "Something to get you started"
            )}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {keywords.length
              ? `Picked from what you already post. Hit + to add one to your board — or download it without saving.`
              : "Free photos from Pixabay. Add one to your board, or download it."}
          </p>
        </div>

        <Link
          href={`/search?q=${encodeURIComponent(query)}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          Search for more
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* A row, not a masonry grid. This is a shelf you scan sideways, and the
          fixed columns keep it from growing taller than the section above it. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {images.map((image) => (
          <PixabayResultCard key={image.providerId} image={image} signedIn={signedIn} />
        ))}
      </div>
    </section>
  );
}
