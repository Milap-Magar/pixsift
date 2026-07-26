"use client";

// An endless grid of PINS ONLY — the dashboard, a profile, an author feed.
//
// The home page uses <InfiniteFeed> instead, because it mixes in live Pixabay
// results. Both share the scroll machinery in use-infinite-list.ts; this one
// just points at /api/dashboard and renders through the ordinary <PinGrid>.
//
// Paging is by CURSOR, never by page number. The cursor is "the last pin you
// saw", so a pin added while you're scrolling can't shift the window and make
// you see a duplicate or skip one — the bug you always get with ?page=2 feeds.
// See lib/db/pins.ts for the query behind it.

import type { SavedPin } from "@/lib/db/pins";

import InfiniteStatus from "./infinite-status";
import PinGrid from "./pin-grid";
import { useInfiniteList } from "./use-infinite-list";

// Module scope, so their identity is stable across renders — see the note in
// use-infinite-list.ts.
const selectPins = (payload: unknown) => {
  const page = payload as { pins: SavedPin[]; nextCursor: string | null };
  return { items: page.pins, nextCursor: page.nextCursor };
};
const keyOf = (pin: SavedPin) => pin.id;

type InfinitePinGridProps = {
  initialPins: SavedPin[];
  initialCursor: string | null;
  favoriteIds: string[];
  signedIn: boolean;
  /** Defaults to the main feed. Pass `?author=…` to page one person's pins. */
  endpoint?: string;
  /** Rows per fetch. Match the server's first page so the rhythm stays even. */
  pageSize?: number;
  empty?: React.ReactNode;
};

export default function InfinitePinGrid({
  initialPins,
  initialCursor,
  favoriteIds,
  signedIn,
  endpoint = "/api/dashboard",
  pageSize = 30,
  empty,
}: InfinitePinGridProps) {
  const { items, loading, error, done, loadMore, sentinel } = useInfiniteList<SavedPin>({
    initialItems: initialPins,
    initialCursor,
    endpoint,
    pageSize,
    select: selectPins,
    getKey: keyOf,
  });

  if (items.length === 0 && empty) return <>{empty}</>;

  return (
    <>
      <PinGrid pins={items} favoriteIds={favoriteIds} signedIn={signedIn} />

      <InfiniteStatus
        sentinel={sentinel}
        loading={loading}
        error={error}
        done={done}
        onRetry={() => void loadMore()}
      />
    </>
  );
}
