// "/search" — find images on Pixabay, save the ones you want.
//
// This is the screen that makes the Pixabay integration visible. Everything on
// it is BORROWED: nothing here is in your database until someone presses Save,
// at which point exactly one document (link, title, description, tags, provider
// id) is written. See lib/pixabay.ts for the caching and rate-limit rules.
//
// A Server Component, so the API key never leaves the server and results are in
// the HTML. The form is a plain GET form — search works with JavaScript off, and
// every query is a shareable, bookmarkable URL.

import { Search } from "lucide-react";

import PixabayResultCard from "@/app/components/pixabay-result-card";
import SiteHeader from "@/app/components/site-header";
import { PixabayError, isPixabayConfigured, searchImages } from "@/lib/pixabay";
import { currentUser } from "@/lib/session";

export const metadata = {
  title: "Search — PixSift",
  description: "Search millions of free photos and save the ones you like.",
};

/** Shown before anyone types. Also a hint that this searches Pixabay, not the site. */
const SUGGESTIONS = ["mountains", "city at night", "ocean", "forest", "desert", "snow"];

export default async function SearchPage({
  // Next 16: searchParams is a Promise.
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const query = q?.trim() ?? "";
  const pageNumber = Math.max(Number(page) || 1, 1);

  const user = await currentUser();

  let images: Awaited<ReturnType<typeof searchImages>>["images"] = [];
  let totalHits = 0;
  let error: string | null = null;

  if (!isPixabayConfigured()) {
    error = "Image search isn't configured — add PIXABAY_API_KEY to .env and restart.";
  } else if (query) {
    try {
      const result = await searchImages({ query, page: pageNumber, perPage: 30 });
      images = result.images;
      totalHits = result.totalHits;
    } catch (cause) {
      error =
        cause instanceof PixabayError
          ? cause.message
          : "Search failed. Try again in a moment.";
    }
  }

  const hasNextPage = totalHits > pageNumber * 30;

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <form action="/search" method="get" className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search free photos — mountains, city, ocean…"
              aria-label="Search for photos"
              autoFocus
              className="h-11 w-full rounded-full border border-black/10 bg-white pr-4 pl-11 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-white/15 dark:bg-zinc-900"
            />
          </div>
          <button
            type="submit"
            className="h-11 cursor-pointer rounded-full bg-red-600 px-6 font-mono text-sm text-white transition hover:bg-red-700"
          >
            Search
          </button>
        </form>

        {error && (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {!error && !query && (
          <div className="py-16 text-center">
            <p className="text-lg font-medium">Search millions of free photos</p>
            <p className="mt-1 text-sm text-zinc-500">
              Results come from Pixabay. Press <span className="font-mono">+</span> on any photo to
              save it to your board.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <a
                  key={suggestion}
                  href={`/search?q=${encodeURIComponent(suggestion)}`}
                  className="rounded-full border border-black/10 px-4 py-1.5 font-mono text-sm text-zinc-600 transition hover:bg-black/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  {suggestion}
                </a>
              ))}
            </div>
          </div>
        )}

        {!error && query && images.length === 0 && (
          <p className="py-16 text-center text-sm text-zinc-500">
            Nothing found for &ldquo;{query}&rdquo;. Try a broader word.
          </p>
        )}

        {images.length > 0 && (
          <>
            <p className="mb-4 text-sm text-zinc-500">
              {totalHits.toLocaleString()} results for &ldquo;{query}&rdquo;
              {pageNumber > 1 && ` · page ${pageNumber}`}
            </p>

            {/* Same masonry as the main grid. */}
            <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
              {images.map((image) => (
                <PixabayResultCard
                  key={image.providerId}
                  image={image}
                  signedIn={Boolean(user)}
                />
              ))}
            </div>

            {/* Plain links, not infinite scroll: search results are borrowed and
                rate-limited, so paging deliberately stays a deliberate act. */}
            <nav className="flex justify-center gap-3 py-10 font-mono text-sm">
              {pageNumber > 1 && (
                <a
                  href={`/search?q=${encodeURIComponent(query)}&page=${pageNumber - 1}`}
                  className="rounded-full border border-black/10 px-4 py-1.5 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ← Previous
                </a>
              )}
              {hasNextPage && (
                <a
                  href={`/search?q=${encodeURIComponent(query)}&page=${pageNumber + 1}`}
                  className="rounded-full border border-black/10 px-4 py-1.5 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  Next →
                </a>
              )}
            </nav>
          </>
        )}
      </main>
    </div>
  );
}
