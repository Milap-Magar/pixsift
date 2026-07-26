// THE DISCOVER PAGE ("/discover") — public, built for looking around.
//
// The home grid answers "what's here?". This answers "what's here about X?".
//
// The topic chips aren't a hardcoded list: they're the most distinctive terms in
// the catalogue, ranked by the same TF-IDF weighting the recommender uses
// (lib/recommend/text.ts). So they stay meaningful as pins are added, and a word
// that ends up in every pin automatically stops being offered as a filter.

import Link from "next/link";
import { Search, Sparkles, X } from "lucide-react";

import PinGrid from "@/app/components/pin-grid";
import SiteHeader from "@/app/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { listAllPins } from "@/lib/db/pins";
import { getFavoriteIds, type Pin } from "@/lib/pins";
import { documentText, tokenize } from "@/lib/recommend/text";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Discover · PixSift",
  description: "Search the whole gallery, or jump in by topic.",
};

const MAX_TOPICS = 10;

/**
 * The most *distinctive* words in the catalogue.
 *
 * Ranking by raw frequency would surface whatever is most common, which is the
 * least informative thing available. Weighting by idf instead favours terms that
 * split the collection into meaningful groups. We drop anything appearing in
 * only one pin (no grouping value) or in more than half of them (too generic).
 */
function extractTopics(pins: Pin[]): Array<{ term: string; count: number }> {
  const documentFrequency = new Map<string, number>();

  for (const pin of pins) {
    for (const term of new Set(tokenize(documentText(pin)))) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const total = pins.length;
  const upperBound = Math.max(2, Math.floor(total * 0.5));

  return [...documentFrequency.entries()]
    .filter(([, count]) => count >= 2 && count <= upperBound)
    .map(([term, count]) => ({
      term,
      count,
      weight: count * (Math.log((total + 1) / (count + 1)) + 1),
    }))
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
    .slice(0, MAX_TOPICS)
    .map(({ term, count }) => ({ term, count }));
}

/** Match against the same tokens the recommender sees, so "mountains" finds "mountain". */
function matches(pin: Pin, query: string): boolean {
  const haystack = tokenize(documentText(pin));
  const needles = tokenize(query);

  // An unstemmable query ("...", "the") shouldn't silently return everything.
  if (needles.length === 0) {
    return documentText(pin).toLowerCase().includes(query.trim().toLowerCase());
  }

  return needles.every((needle) => haystack.some((word) => word.startsWith(needle)));
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";

  const user = await currentUser();
  const favoriteIds = user ? [...getFavoriteIds(user.id)] : [];

  // Topic extraction needs document frequencies across the whole catalogue, not
  // one page of it — hence `listAllPins` rather than `listPins`. It's capped
  // (MAX_SCAN in lib/db/pins.ts); past that the chips would need a precomputed
  // term table instead of counting on every request.
  const allPins = await listAllPins({ viewerId: user?.id });
  const topics = extractTopics(allPins);
  const pins = query ? allPins.filter((pin) => matches(pin, query)) : allPins;

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Sparkles className="size-5" />
              Discover
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {query
                ? `${pins.length} ${pins.length === 1 ? "result" : "results"} for “${query}”`
                : `Search ${allPins.length} pins, or start from a topic.`}
            </p>
          </div>

          {/* A GET form — no JavaScript needed, and the result is a shareable URL. */}
          <form method="get" action="/discover" className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="mountains, rain, forest…"
                aria-label="Search pins"
                className="h-11 w-full rounded-full border border-border bg-background pr-4 pl-9 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <button
              type="submit"
              className={cn(buttonVariants({ variant: "default" }), "h-11 rounded-full px-5")}
            >
              Search
            </button>
          </form>

          {topics.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {query && (
                <Link
                  href="/discover"
                  className={cn(
                    buttonVariants({ variant: "secondary" }),
                    "h-8 gap-1.5 rounded-full px-3 text-xs",
                  )}
                >
                  <X className="size-3" />
                  Clear
                </Link>
              )}

              {topics.map(({ term, count }) => {
                const active = query.toLowerCase() === term;
                return (
                  <Link
                    key={term}
                    href={`/discover?q=${encodeURIComponent(term)}`}
                    className={cn(
                      buttonVariants({ variant: active ? "secondary" : "outline" }),
                      "h-8 gap-1.5 rounded-full px-3 text-xs font-mono",
                      active && "ring-1 ring-black/10 dark:ring-white/15",
                    )}
                  >
                    {term}
                    <span className="text-zinc-500">{count}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <PinGrid
          pins={pins}
          favoriteIds={favoriteIds}
          signedIn={Boolean(user)}
          empty={
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/10 py-20 text-center dark:border-white/15">
              <Search className="size-7 text-zinc-400" />
              <p className="font-medium">Nothing matched “{query}”</p>
              <p className="max-w-xs text-sm text-zinc-500">
                Try one of the topics above, or a broader word.
              </p>
            </div>
          }
        />
      </main>
    </div>
  );
}
