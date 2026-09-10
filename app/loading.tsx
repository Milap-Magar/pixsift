// Shown while the landing wall waits on its first page.
//
// `/` is a Server Component that hits MongoDB and then Pixabay before it can
// render anything (see lib/feed.ts), so without this the router sits on the
// previous screen for the whole round trip and the click reads as dead.
//
// The skeleton is the SAME masonry as the real wall — identical column counts
// and gap — so the tiles land in place instead of jumping when the feed
// arrives. Heights are a fixed repeating pattern rather than random: this
// renders on the server and streams, and random heights would differ between
// the server HTML and the client render.

import SiteHeader from "@/app/components/site-header";

/** Tile heights, in the same units the real cards land at. Cycled, not random. */
const HEIGHTS = [260, 340, 200, 300, 380, 240, 320, 220, 360, 280];

/** Enough to fill a 6-column wall above the fold without paying for more. */
const TILE_COUNT = 24;

export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <div
          // Matches PinGrid and InfiniteFeed exactly. If those change, this
          // must change with them or the swap will visibly reflow.
          className="columns-2 gap-4 *:mb-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6"
          aria-hidden
        >
          {Array.from({ length: TILE_COUNT }, (_, index) => (
            <div
              key={index}
              className="break-inside-avoid animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800"
              style={{ height: HEIGHTS[index % HEIGHTS.length] }}
            />
          ))}
        </div>

        {/* Screen readers get a sentence; sighted users get the tiles above. */}
        <p className="sr-only" role="status">
          Loading photos…
        </p>
      </main>
    </div>
  );
}
