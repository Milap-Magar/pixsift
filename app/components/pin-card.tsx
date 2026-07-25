// One tile in the masonry grid.
//
// The whole card links through to /pin/[id]. The heart sits OUTSIDE that link
// rather than inside it — nesting a button in an anchor is invalid, and it would
// navigate away the moment you tried to save.

import Link from "next/link";

import { cdnImage } from "@/lib/cloudinary-url";
import type { Pin } from "@/lib/pins";

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

  return (
    <figure className="group relative break-inside-avoid overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
      <Link href={href} className="block">
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
          className="h-auto w-full object-cover transition group-hover:opacity-90"
          loading="lazy"
          decoding="async"
        />

        <figcaption className="p-3">
          <p className="leading-tight font-medium">{pin.title}</p>
          <p className="mt-1 text-xs text-zinc-500">by {pin.author}</p>
          {caption && (
            <p className="mt-1.5 text-xs text-zinc-400 italic dark:text-zinc-500">{caption}</p>
          )}
        </figcaption>
      </Link>

      <FavoriteToggle
        pinId={pin.id}
        pinTitle={pin.title}
        favorited={favorited}
        signedIn={signedIn}
        returnTo={href}
        className={heartButtonClasses}
        showLabel={false}
      />
    </figure>
  );
}
