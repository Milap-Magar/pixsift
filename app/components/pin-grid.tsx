// The masonry grid. CSS `columns` gives the classic Pinterest tiling: each card
// keeps its natural height and they pack into vertical columns.
//
// This is a plain component (no hooks), so it renders on the server. It receives
// the caller's favourite ids and hands each card the flag it needs — the cards
// themselves never query the session.

import type { Pin } from "@/lib/pins";

import PinCard from "./pin-card";

type PinGridProps = {
  pins: Pin[];
  favoriteIds: string[];
  signedIn: boolean;
  /** Shown instead of the grid when there's nothing to display. */
  empty?: React.ReactNode;
  /**
   * pinId -> a short line under the card. The details page uses it to show WHY
   * the recommender picked each suggestion, which makes the algorithm's
   * behaviour visible instead of mysterious.
   */
  captions?: Record<string, string>;
  /**
   * Passed straight to each card: the viewer's id, when this grid is inside the
   * dashboard. Their own pins then open in the dashboard's own detail view.
   */
  manageOwnerId?: string;
};

export default function PinGrid({
  pins,
  favoriteIds,
  signedIn,
  empty,
  captions,
  manageOwnerId,
}: PinGridProps) {
  if (pins.length === 0 && empty) return <>{empty}</>;

  const favorites = new Set(favoriteIds);

  return (
    // Column count climbs with the viewport. Now that pages run full-bleed up to
    // 1660px, stopping at 4 columns would stretch each tile to ~380px on a
    // laptop and far wider on a desktop — the opposite of the dense Pinterest
    // wall this is meant to be.
    <div className="columns-2 gap-4 *:mb-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
      {pins.map((pin) => (
        <PinCard
          key={pin.id}
          pin={pin}
          favorited={favorites.has(pin.id)}
          signedIn={signedIn}
          caption={captions?.[pin.id]}
          manageOwnerId={manageOwnerId}
        />
      ))}
    </div>
  );
}
