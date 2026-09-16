// THE IMAGE DETAILS PAGE ("/pin/[id]").
//
// Public to read. The two things that need an account — saving and commenting —
// each swap themselves for a one-click login trigger rather than disappearing.
//
// The "More like this" section is fed by `relatedPins` from lib/recommend/.
// Three algorithms live there and are chosen with the RECOMMENDER env var —
// see docs/ALGORITHMS.md. Nothing on this page changes when you swap or add one
// (and if yours is async, just `await` the call below).

import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy, Lock, Palette, Share2 } from "lucide-react";

import DeletePinButton from "@/app/components/delete-pin-button";
import DownloadMenu from "@/app/components/download-menu";
import HashGrid from "@/app/components/hash-grid";
import PaletteStrip from "@/app/components/palette-strip";
import { findNearDuplicates } from "@/lib/algorithms/hamming";
import { HASH_BITS } from "@/lib/algorithms/phash";
import { cdnImage, isCloudinaryUrl } from "@/lib/cloudinary-url";
import CommentThread from "@/app/components/comment-thread";
import FavoriteToggle from "@/app/components/favorite-toggle";
import PinGrid from "@/app/components/pin-grid";
import SharePanel from "@/app/components/share-panel";
import SiteHeader from "@/app/components/site-header";
import { getComments } from "@/lib/comments";
import { getPinById, listAllPins, listPinHashes } from "@/lib/db/pins";
import { timeAgo } from "@/lib/format";
import { getFavoriteIds } from "@/lib/pins";
import { relatedPins } from "@/lib/recommend";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import VisibilityToggle from "@/app/components/visibility-toggle";

const actionButtonClasses =
  "flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition hover:bg-muted";

/**
 * Metadata is deliberately PUBLIC-only: no viewer is passed, so a private pin
 * gets the "not found" title. Page metadata is what leaks into link previews and
 * crawlers, and a private pin's title showing up in an unfurled Slack link would
 * defeat the point even though the page itself refuses to render.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pin = await getPinById(id);
  if (!pin) return { title: "Pin not found · PixSift" };

  return {
    title: `${pin.title} · PixSift`,
    description: pin.description ?? `A pin by ${pin.author} on PixSift.`,
    openGraph: { images: [pin.imageUrl] },
  };
}

export default async function PinDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The session comes first, because whether this pin EXISTS as far as the
  // request is concerned depends on who's asking: a private pin resolves for its
  // author and 404s for everyone else. Same answer as a deleted pin, on purpose —
  // a distinct "403 Forbidden" would confirm the pin is real.
  const user = await currentUser();

  const pin = await getPinById(id, user?.id);
  if (!pin) notFound();

  const favoriteIds = user ? [...getFavoriteIds(user.id)] : [];
  const comments = getComments(pin.id);
  const isOwner = user?.id === pin.authorId;

  // ⬇ The algorithm's output. Swap the implementation in lib/recommend.ts.
  const related = relatedPins(pin, await listAllPins({ viewerId: user?.id }));

  // ⬇ Algorithms 1 + 2: everything within DUPLICATE_THRESHOLD bits of this
  // pin's own hash. Viewer-scoped, so a private pin can't be surfaced here to
  // someone who isn't its author — which matters more on this section than most,
  // since its whole job is to reveal that a similar image exists.
  const nearDuplicates = pin.phash
    ? findNearDuplicates(pin.phash, await listPinHashes({ viewerId: user?.id }), {
        excludeId: pin.id,
        limit: 6,
      })
    : [];

  // Resolved server-side so the share links are identical in both renders.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${protocol}://${host}/pin/${pin.id}`;

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-foreground"
        >
          <ArrowLeft className="size-6" />
        </Link>

        <article className="grid gap-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 md:grid-cols-2 dark:bg-zinc-900 dark:ring-white/10">
          <div className="bg-zinc-100 dark:bg-black/40">
            {/* The hero: bigger transform, best quality, and eager — it's the
                LCP element on this page, so lazy-loading it would hurt. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cdnImage(pin.imageUrl, { width: 1200, quality: "auto:good" })}
              alt={pin.title}
              width={pin.width}
              height={pin.height}
              className="h-full max-h-[70vh] w-full object-contain"
              fetchPriority="high"
            />
          </div>

          <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <FavoriteToggle
                pinId={pin.id}
                pinTitle={pin.title}
                favorited={favoriteIds.includes(pin.id)}
                signedIn={Boolean(user)}
                returnTo={`/pin/${pin.id}`}
                className={actionButtonClasses}
              />

              {/* A real navigation, not fetch(): the route sets
                  Content-Disposition, so the browser saves rather than opens.
                  `resizable` is false for a pin whose image lives somewhere
                  other than Cloudinary — there's no transformation to inject,
                  so offering four sizes would hand back the same file four
                  times. */}
              <DownloadMenu
                href={`/api/pins/${encodeURIComponent(pin.id)}/download`}
                resizable={isCloudinaryUrl(pin.imageUrl)}
                maxWidth={pin.width}
                className={actionButtonClasses}
              />

              {/* Only the author gets these, and the Server Actions behind
                  them re-check ownership — the missing button is the courtesy,
                  the check in the query is the rule.

                  Delete is here as well as in the dashboard because this is
                  where you end up when you follow your own link from somewhere
                  else, and "go to the dashboard first" is a poor answer to
                  "get this photo off the internet". It lands you on your pins
                  afterwards, since this page is about to stop existing. */}
              {isOwner && (
                <>
                  <VisibilityToggle pinId={pin.id} visibility={pin.visibility} />
                  <DeletePinButton
                    pinId={pin.id}
                    pinTitle={pin.title}
                    removesFile={pin.source === "upload"}
                    redirectTo="/dashboard/pins"
                  />
                </>
              )}

              <SharePanel
                title={pin.title}
                shareUrl={shareUrl}
                className={cn(actionButtonClasses, "ml-auto")}
              >
                <Share2 className="size-4" />
                Share
              </SharePanel>
            </div>

            {pin.visibility === "private" && (
              <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
                <Lock className="size-3.5 shrink-0" />
                This pin is private — nobody else can open this page, and it stays out
                of the feed, search and recommendations.
              </p>
            )}

            <div>
              <h1 className="text-3xl leading-tight font-semibold">{pin.title}</h1>
              {pin.description && (
                <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
                  {pin.description}
                </p>
              )}
              <p className="mt-4 text-sm text-zinc-500">
                by {pin.author} ·{" "}
                <time dateTime={new Date(pin.createdAt).toISOString()} suppressHydrationWarning>
                  {timeAgo(pin.createdAt)}
                </time>
              </p>
            </div>

            {/* ── Algorithm 3, made visible ────────────────────────────────
                The five dominant colours k-means found in this photograph,
                each band as wide as the share of the image it covers. Every
                swatch links into /colors, so the palette is a set of
                navigation handles rather than only a readout. */}
            {pin.palette?.length ? (
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">
                  <Palette className="size-3.5" />
                  Dominant colours
                </h2>

                <PaletteStrip palette={pin.palette} showLabels height="h-14" />

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {pin.palette.map((swatch) => (
                    <Link
                      key={swatch.hex}
                      href={`/colors?c=${swatch.hex.slice(1)}`}
                      className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] transition hover:bg-muted"
                    >
                      <span
                        className="size-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                        style={{ backgroundColor: swatch.hex }}
                      />
                      {swatch.hex}
                    </Link>
                  ))}
                </div>

                <p className="mt-2 text-xs text-zinc-500">
                  Found by clustering this image&rsquo;s pixels into five groups with
                  k-means. Click a colour to find more like it.
                </p>
              </section>
            ) : null}

            <hr className="border-black/5 dark:border-white/10" />

            <CommentThread
              pinId={pin.id}
              initialComments={comments}
              signedIn={Boolean(user)}
              currentUserId={user?.id}
              returnTo={`/pin/${pin.id}`}
            />
          </div>
        </article>

        {/* ── Algorithms 1 + 2, made visible ─────────────────────────────
            Not "similar subject" — similar PIXELS. This section and "More like
            this" below answer genuinely different questions, which is why both
            exist: the recommender matches on words and on who saved what, while
            this matches on what the photograph looks like. A resized re-upload
            of this exact image appears here and nowhere else. */}
        {nearDuplicates.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Copy className="size-5" />
                Near-duplicates
              </h2>
              <p className="text-sm text-zinc-500">
                Images whose {HASH_BITS}-bit perceptual hash is close to this one&rsquo;s.
              </p>
            </div>

            <ul className="flex flex-wrap gap-4">
              {nearDuplicates.map(({ item, distance, verdict }) => (
                <li key={item.id} className="w-40">
                  <Link
                    href={`/pin/${encodeURIComponent(item.id)}`}
                    className="block overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:opacity-90 dark:bg-zinc-900 dark:ring-white/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cdnImage(item.imageUrl, { width: 320 })}
                      alt={item.title}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                  </Link>

                  <div className="mt-2 flex items-start gap-2">
                    {/* The two hashes side by side, differing bits in red.
                        An abstract distance becomes something you can see. */}
                    <HashGrid hash={item.phash} diffAgainst={pin.phash} size={28} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium" title={item.title}>
                        {item.title}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-500">
                        {distance} bits · {verdict}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* The pin's own fingerprint. Small, and worth having on the page: it
            is the concrete artefact behind every duplicate claim above, and the
            8×8 grid is the same 64 bits the hex string spells out. */}
        {pin.phash && (
          <section className="mt-10 flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
            <HashGrid hash={pin.phash} size={64} />
            <div>
              <h2 className="text-sm font-medium">Perceptual hash</h2>
              <p className="mt-0.5 font-mono text-sm text-zinc-500">{pin.phash}</p>
              <p className="mt-1 max-w-lg text-xs text-zinc-500">
                {HASH_BITS} bits describing what this photo looks like, not what its file
                contains — so a resized or re-compressed copy produces nearly the same
                value. Each square is one coefficient of the image&rsquo;s discrete cosine
                transform.
              </p>
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">More like this</h2>
          {related.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing to compare against yet.</p>
          ) : (
            <PinGrid
              pins={related.map((scored) => scored.pin)}
              favoriteIds={favoriteIds}
              signedIn={Boolean(user)}
              // Surfacing each suggestion's `reason` turns the ranker from a
              // black box into something you can sanity-check at a glance.
              captions={Object.fromEntries(
                related.map((scored) => [scored.pin.id, scored.reason]),
              )}
            />
          )}
        </section>
      </main>
    </div>
  );
}
