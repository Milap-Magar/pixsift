// One tile in the masonry grid.
//
// The whole card links through to /pin/[id]. The heart sits OUTSIDE that link
// rather than inside it — nesting a button in an anchor is invalid, and it would
// navigate away the moment you tried to save.

import Link from "next/link";
import { Lock } from "lucide-react";

import { cdnImage } from "@/lib/cloudinary-url";
import type { Pin } from "@/lib/pins";

import { DownloadIconButton } from "./download-menu";
import FavoriteToggle from "./favorite-toggle";

type PinCardProps = {
  pin: Pin;
  /** Whether the current user has saved this pin. Always false when signed out. */
  favorited: boolean;
  signedIn: boolean;
  /** Optional "why you're seeing this" line — supplied by the recommender. */
  caption?: string;
};

const heartButtonClasses =
  "absolute top-3 right-3 z-10 grid size-9 cursor-pointer place-items-center rounded-full bg-white/85 text-zinc-700 shadow-md backdrop-blur transition hover:scale-105 hover:bg-white focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:bg-black/60 dark:text-zinc-200 dark:hover:bg-black/80";

export default function PinCard({ pin, favorited, signedIn, caption }: PinCardProps) {
  const href = `/pin/${encodeURIComponent(pin.id)}`;

  // Reserve the tile's exact shape before the image loads, so the masonry
  // doesn't reflow as photos arrive — the layout-shift problem Gate 4 calls
  // out, and the same fix <PixabayResultCard> already uses.
  //
  // Only when we actually KNOW the dimensions, though. `width` and `height` are
  // optional on a Pin (a pasted link that was never analysed has neither), and
  // guessing a square would crop those photos through `object-cover` rather
  // than just failing to reserve space for them. Unknown dimensions keep the
  // old behaviour: natural height, one reflow.
  const ratio = pin.width && pin.height ? pin.width / pin.height : undefined;

  return (
    // `isolate` is load-bearing, not decoration. Without it this figure is
    // `position: relative` with `z-index: auto`, which does NOT create a
    // stacking context — so the heart's z-10 escapes the card and competes
    // against the sticky header at the root level. Same z-index means DOM order
    // wins, the grid comes after the header, and the hearts render over the nav.
    // Isolating keeps every z-index inside this card scoped to this card.
    <figure className="group relative isolate break-inside-avoid overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
      {/* Plain <img> (not next/image) so we don't need to configure remote
          image domains — pins can point at any host. Cloudinary-hosted pins
          get resized at the edge instead; non-Cloudinary URLs pass through
          cdnImage untouched. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cdnImage(pin.imageUrl, { width: 500 })}
        alt={pin.title}
        width={pin.width}
        height={pin.height}
        // The grey is the placeholder: the box is already the right size, so
        // this is what fills it until the pixels land. The image is opaque once
        // decoded, so it's never visible afterwards.
        className="h-auto w-full bg-zinc-200 object-cover transition group-hover:opacity-90 dark:bg-zinc-800"
        style={ratio ? { aspectRatio: ratio } : undefined}
        loading="lazy"
        decoding="async"
      />

      {/* A private pin only ever reaches a grid its own author is looking at —
          the query wouldn't have returned it otherwise — so this badge is a
          reminder of a state you chose, not a warning about a leak. */}
      {pin.visibility === "private" && (
        <span className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          <Lock className="size-3" />
          Private
        </span>
      )}

      <figcaption className="p-3">
        {/* Stretched link: the ::after pseudo-element covers the whole figure,
            so the entire card is clickable while the markup stays valid.
            <figcaption> is only allowed as a direct child of <figure>, so it
            can't live inside the <a> — that nesting is exactly the kind of
            thing the browser's parser rewrites, which desyncs hydration. */}
        <Link
          href={href}
          className="leading-tight font-medium after:absolute after:inset-0 after:rounded-2xl"
        >
          {pin.title}
        </Link>
        <p className="mt-1 text-xs text-zinc-500">by {pin.author}</p>
        {caption && (
          <p className="mt-1.5 text-xs text-zinc-400 italic dark:text-zinc-500">{caption}</p>
        )}
      </figcaption>

      {/* Both sit above the stretched link's overlay — that's what the z-10 in
          heartButtonClasses is for, and why the figure must `isolate`.

          Download is here rather than only on the detail page because it is the
          single most common thing a visitor wants from a photo grid, and making
          them open the pin first is a click charged for nothing. It appears on
          hover so it doesn't compete with the heart at rest. */}
      <FavoriteToggle
        pinId={pin.id}
        pinTitle={pin.title}
        favorited={favorited}
        signedIn={signedIn}
        returnTo={href}
        className={heartButtonClasses}
        showLabel={false}
      />

      <DownloadIconButton
        href={`/api/pins/${encodeURIComponent(pin.id)}/download`}
        title={pin.title}
        // `focus-within` isn't enough on its own here — the button must also be
        // reachable by keyboard, and `opacity-0` alone would leave a focusable
        // control the user cannot see. `group-focus-within` brings it back the
        // moment anything inside the card takes focus.
        className="absolute top-3 right-14 z-10 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
      />
    </figure>
  );
}
