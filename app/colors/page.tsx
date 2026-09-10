// BROWSE BY COLOUR ("/colors").
//
// The screen k-means exists for. Pick a colour and every photograph is ranked by
// how much of it is that colour — using the palettes clustered at upload time,
// so the search itself costs no image processing at all.
//
// Public: no session needed to browse, and the query is viewer-scoped so a
// signed-in user also sees their own private pins.
//
// ── The two-stage search ─────────────────────────────────────────────────
//   RETRIEVE  narrow to pins whose palette contains a nearby colour FAMILY,
//             through the multikey `by_color_family` index. Cheap, coarse,
//             index-backed.
//   RANK      score those by ΔE in CIELAB, weighted by each swatch's share.
//             Expensive, precise, and done in Node over a small set.
//
// Same shape as the Pixabay recommender in lib/recommend/similar-images.ts:
// narrow cheaply, then score properly. Retrieval decides what CAN appear;
// ranking decides what does.

import Link from "next/link";
import { Palette, SearchX } from "lucide-react";

import PaletteStrip from "@/app/components/palette-strip";
import SiteHeader from "@/app/components/site-header";
import { Badge } from "@/components/ui/badge";
import { fromHex, readableTextOn, toHex } from "@/lib/algorithms/color";
import { cdnImage } from "@/lib/cloudinary-url";
import { familiesToSearch, rankByColor } from "@/lib/color-search";
import { listPinsWithPalette } from "@/lib/db/pins";
import { currentUser } from "@/lib/session";

import ColorPicker from "./color-picker";

/** Where the page lands with no colour chosen. A mid blue reads well in both themes. */
const DEFAULT_COLOR = "#2b6cb0";

export const metadata = {
  title: "Browse by colour · PixSift",
  description: "Find photos by their dominant colours, extracted with k-means clustering.",
};

export default async function ColorsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { c } = await searchParams;

  // `fromHex` tolerates a missing hash and 3-digit shorthand, and returns null
  // for anything else — so a hand-edited `?c=drop table` falls back rather than
  // reaching the ranker.
  const target = fromHex(typeof c === "string" ? c : "") ?? fromHex(DEFAULT_COLOR)!;
  const hex = toHex(target);

  const user = await currentUser();

  const candidates = await listPinsWithPalette({
    viewerId: user?.id,
    families: familiesToSearch(target),
  });

  const matches = rankByColor(candidates, target, { limit: 60 });

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 font-heading text-3xl leading-tight">
                <Palette className="size-6" />
                Browse by colour
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Every photo&rsquo;s five dominant colours are found by clustering its
                pixels with k-means. Pick a colour and they&rsquo;re ranked by how much of
                each image actually is it.
              </p>
            </div>

            <div
              className="flex h-16 w-32 items-center justify-center rounded-xl font-mono text-sm shadow-sm ring-1 ring-black/10 dark:ring-white/15"
              style={{ backgroundColor: hex, color: readableTextOn(target) }}
            >
              {hex}
            </div>
          </div>

          <ColorPicker selected={hex} />
        </header>

        {matches.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
            <SearchX className="size-7 text-muted-foreground" />
            <p className="font-medium">Nothing close to {hex}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {candidates.length === 0
                ? "No photos have been analysed yet — their palettes are what this page searches."
                : "Try a neighbouring colour, or something less saturated. Photographs hold far fewer pure hues than a colour wheel suggests."}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {matches.length} photo{matches.length === 1 ? "" : "s"}, most-of-this-colour
              first.
            </p>

            {/* Masonry, matching every other grid in the app. */}
            <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5 [&>*]:mb-4">
              {matches.map(({ pin, score, closest }) => (
                <figure
                  key={pin.id}
                  className="group relative isolate break-inside-avoid overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10"
                >
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

                  {pin.palette?.length ? (
                    <PaletteStrip palette={pin.palette} height="h-2" className="rounded-none" />
                  ) : null}

                  <figcaption className="p-3">
                    <Link
                      href={`/pin/${encodeURIComponent(pin.id)}`}
                      className="leading-tight font-medium after:absolute after:inset-0"
                    >
                      {pin.title}
                    </Link>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {/* The "why this result" line. Showing the matched swatch
                          and its ΔE turns the ranking from a black box into
                          something a reader can check by eye. */}
                      <span
                        className="size-3 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                        style={{ backgroundColor: closest.hex }}
                        title={`${closest.hex} — ΔE ${closest.deltaE.toFixed(1)} from ${hex}`}
                      />
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {Math.round(score * 100)}% match
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        ΔE {closest.deltaE.toFixed(0)}
                      </span>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
