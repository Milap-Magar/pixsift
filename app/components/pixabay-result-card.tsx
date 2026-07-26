// One Pixabay search result: a tile that opens the image, plus a Save button.
//
// Nothing here is in our database. The tile links to /photo/[id] — a details
// page rendered live from Pixabay's API — and only the Save button writes
// anything, via <SavePixabayButton>.
//
// Deliberately NOT a <PinCard>: a result has no pin id and no favourite state.
// It's a candidate, not a pin. This stays a Server Component; the one piece that
// needs state (saving) is its own client island.

import Link from "next/link";

import type { PixabayImage } from "@/lib/pixabay";

import SavePixabayButton from "./save-pixabay-button";

export default function PixabayResultCard({
  image,
  signedIn,
  caption,
}: {
  image: PixabayImage;
  signedIn: boolean;
  /** Optional "why you're seeing this" line — supplied by the recommender. */
  caption?: string;
}) {
  // Reserve the exact aspect ratio up front so the masonry doesn't reflow as
  // images arrive — the layout-shift problem the roadmap calls out.
  const ratio = image.width && image.height ? image.width / image.height : 1;
  const href = `/photo/${encodeURIComponent(image.providerId)}`;

  return (
    // `isolate` keeps the Save button's z-index scoped to this card instead of
    // competing with the sticky header — same reasoning as PinCard.
    <figure className="group relative isolate mb-4 break-inside-avoid overflow-hidden rounded-2xl bg-zinc-200 dark:bg-zinc-800">
      {/* Plain <img>: these are third-party hosts, and next/image would need
          every one of them in remotePatterns. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.imageUrl}
        alt={image.description || image.title}
        loading="lazy"
        style={{ aspectRatio: ratio }}
        className="w-full object-cover transition group-hover:opacity-90"
      />

      {/* A full-bleed overlay link rather than a stretched ::after on the title:
          the caption below is itself absolutely positioned, so `inset-0` there
          would only ever cover the caption strip, not the photo. */}
      <Link href={href} aria-label={`Open "${image.title}"`} className="absolute inset-0" />

      <SavePixabayButton image={image} signedIn={signedIn} variant="icon" />

      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-3 text-white opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <p className="truncate text-sm font-medium">{image.title}</p>

        {/* Attribution. Pixabay doesn't require it — it's still the decent thing,
            and it's the link back a marker will look for. `pointer-events-auto`
            re-enables clicks that the caption disabled so this anchor beats the
            overlay link underneath it. */}
        <a
          href={image.pageUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="pointer-events-auto relative text-xs text-white/80 underline-offset-2 hover:underline"
        >
          {image.credit.name} on Pixabay
        </a>

        {caption && <p className="mt-1 text-xs text-white/70 italic">{caption}</p>}
        {!signedIn && <p className="mt-1 text-xs text-white/70">Sign in to save</p>}
      </figcaption>
    </figure>
  );
}
