"use client";

// The home wall — the one that doesn't stop.
//
// It renders two kinds of tile from a single stream: pins already saved in
// MongoDB (which link through to their detail page) and live Pixabay results
// (which carry a Save button). lib/feed.ts decides which comes when; this only
// has to know how to draw each.
//
// The server renders the first page, so the wall is in the HTML and the first
// screen needs no JavaScript at all.

import type { FeedItem } from "@/lib/feed";

import InfiniteStatus from "./infinite-status";
import PinCard from "./pin-card";
import PixabayResultCard from "./pixabay-result-card";
import { useInfiniteList } from "./use-infinite-list";

// Module scope, so their identity is stable across renders — see the note in
// use-infinite-list.ts.
const selectFeed = (payload: unknown) => payload as { items: FeedItem[]; nextCursor: string | null };
const keyOf = (item: FeedItem) => item.id;

export default function InfiniteFeed({
  initialItems,
  initialCursor,
  favoriteIds,
  signedIn,
}: {
  initialItems: FeedItem[];
  initialCursor: string | null;
  favoriteIds: string[];
  signedIn: boolean;
}) {
  const { items, loading, error, done, loadMore, sentinel } = useInfiniteList<FeedItem>({
    initialItems,
    initialCursor,
    endpoint: "/api/feed",
    select: selectFeed,
    getKey: keyOf,
  });

  const favorites = new Set(favoriteIds);

  return (
    <>
      {/* Same masonry as everywhere else: CSS columns, densest at 2xl. */}
      <div className="columns-2 gap-4 *:mb-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
        {items.map((item) =>
          item.kind === "pin" ? (
            <PinCard
              key={item.id}
              pin={item.pin}
              favorited={favorites.has(item.pin.id)}
              signedIn={signedIn}
            />
          ) : (
            <PixabayResultCard key={item.id} image={item.image} signedIn={signedIn} />
          ),
        )}
      </div>

      <InfiniteStatus
        sentinel={sentinel}
        loading={loading}
        error={error}
        done={done}
        onRetry={() => void loadMore()}
        // Reaching the true end means thousands of images deep — worth saying
        // something less deflating than "that's all".
        doneLabel="That's everything for now."
      />
    </>
  );
}
