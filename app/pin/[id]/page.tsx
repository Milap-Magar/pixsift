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
import { ArrowLeft, Download, Lock, Share2 } from "lucide-react";

import { cdnImage } from "@/lib/cloudinary-url";
import CommentThread from "@/app/components/comment-thread";
import FavoriteToggle from "@/app/components/favorite-toggle";
import PinGrid from "@/app/components/pin-grid";
import SharePanel from "@/app/components/share-panel";
import SiteHeader from "@/app/components/site-header";
import { getComments } from "@/lib/comments";
import { getPinById, listAllPins } from "@/lib/db/pins";
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
                  Content-Disposition, so the browser saves rather than opens. */}
              <a
                href={`/api/pins/${encodeURIComponent(pin.id)}/download`}
                className={actionButtonClasses}
              >
                <Download className="size-4" />
                Download
              </a>

              {/* Only the author gets this, and the Server Action behind it
                  re-checks ownership — the missing button is the courtesy, the
                  check in updatePinVisibility is the rule. */}
              {isOwner && <VisibilityToggle pinId={pin.id} visibility={pin.visibility} />}

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
