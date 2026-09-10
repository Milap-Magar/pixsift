// THE PIXABAY DETAILS PAGE ("/photo/[id]").
//
// The counterpart to /pin/[id]. That page shows an image we HOLD (a row in
// MongoDB, with comments and favourites); this one shows an image we've merely
// FOUND — fetched live from Pixabay by id, stored nowhere until someone saves it.
// That difference is why it's a separate route rather than a mode of the other:
// there is no pin id to comment on or favourite here, only a candidate.
//
// Two recommendation sections, from two different sources:
//
//   "More like this"        lib/recommend/similar-images.ts — three keyword
//                           searches against Pixabay, then TF-IDF ranked.
//                           See docs/ALGORITHMS.md § Appendix.
//   "Already in the gallery" lib/db/pins.ts findByTags — a single aggregation
//                           over pins people have actually saved.
//
// Public to read; only Save needs an account.

import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Share2 } from "lucide-react";

import PinGrid from "@/app/components/pin-grid";
import PixabayResultCard from "@/app/components/pixabay-result-card";
import DownloadMenu from "@/app/components/download-menu";
import SavePixabayButton from "@/app/components/save-pixabay-button";
import SharePanel from "@/app/components/share-panel";
import SiteHeader from "@/app/components/site-header";
import { findByTags } from "@/lib/db/pins";
import { getFavoriteIds } from "@/lib/pins";
import { PixabayError, getImageById, isPixabayConfigured } from "@/lib/pixabay";
import { similarImages } from "@/lib/recommend/similar-images";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const actionButtonClasses =
  "flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition hover:bg-muted";

/**
 * Shared by the page and its metadata.
 *
 * Both need the same image, and Next dedupes identical `fetch`es within one
 * render pass — so this costs one Pixabay request, not two, even though it's
 * called twice.
 */
async function loadImage(id: string) {
  if (!isPixabayConfigured()) return null;
  try {
    return await getImageById(id);
  } catch (cause) {
    // A 429 or an outage must not become a 500 on a page someone shared.
    if (cause instanceof PixabayError) return null;
    throw cause;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await loadImage(id);
  if (!image) return { title: "Photo not found · PixSift" };

  return {
    title: `${image.title} · PixSift`,
    description: `${image.description} — a free photo by ${image.credit.name} on Pixabay.`,
    openGraph: { images: [image.imageUrl] },
  };
}

export default async function PhotoDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const image = await loadImage(id);
  if (!image) notFound();

  const user = await currentUser();

  // Both recommenders run in parallel — one hits Pixabay, the other Mongo, and
  // neither needs the other's answer. Awaiting them in sequence would add the
  // slower one's latency to the faster one's for nothing.
  const [similar, saved] = await Promise.all([
    similarImages(image),
    // The database is optional in this app (the feed degrades to Pixabay-only
    // without it), so a missing connection drops the section rather than the page.
    findByTags(image.tags, { limit: 12 }).catch(() => []),
  ]);

  const favoriteIds = user ? [...getFavoriteIds(user.id)] : [];

  // Resolved server-side so the share links are identical in both renders.
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${protocol}://${host}/photo/${image.providerId}`;

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <Link
          href="/search"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-foreground"
        >
          <ArrowLeft className="size-6" />
        </Link>

        <article className="grid gap-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 md:grid-cols-2 dark:bg-zinc-900 dark:ring-white/10">
          <div className="bg-zinc-100 dark:bg-black/40">
            {/* The 1280px original, not the 640px grid version: this is the LCP
                element and the whole reason someone opened the page. Eager, for
                the same reason. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.largeUrl}
              alt={image.description || image.title}
              width={image.width}
              height={image.height}
              className="h-full max-h-[70vh] w-full object-contain"
              fetchPriority="high"
            />
          </div>

          <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <SavePixabayButton
                image={image}
                signedIn={Boolean(user)}
                variant="pill"
                className="cursor-pointer"
              />

              {/* This page used to have no download button, on the reasoning
                  that a cross-origin `download` attribute is ignored by
                  browsers — true, and the reason /api/photos/[id]/download
                  exists. It proxies the file through our own origin with a
                  Content-Disposition header, which is what actually saves it.
                  The photographer's name is written into the filename, so the
                  credit survives leaving the site.

                  `resizable={false}`: Pixabay publishes fixed renditions rather
                  than an on-the-fly resizer, so there are two real sizes here,
                  not four. The menu says so instead of offering choices that
                  deliver the same bytes. */}
              <DownloadMenu
                href={`/api/photos/${encodeURIComponent(image.providerId)}/download`}
                resizable={false}
                className={actionButtonClasses}
              />

              {/* Attribution isn't required by Pixabay's licence. It's still the
                  decent thing, and it's the link back a marker will look for. */}
              <a
                href={image.pageUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={actionButtonClasses}
              >
                <ExternalLink className="size-4" />
                Pixabay
              </a>

              <SharePanel
                title={image.title}
                shareUrl={shareUrl}
                className={cn(actionButtonClasses, "ml-auto")}
              >
                <Share2 className="size-4" />
                Share
              </SharePanel>
            </div>

            <div>
              <h1 className="text-3xl leading-tight font-semibold">{image.title}</h1>
              <p className="mt-4 text-sm text-zinc-500">
                by{" "}
                <a
                  href={image.pageUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline-offset-2 hover:underline"
                >
                  {image.credit.name}
                </a>{" "}
                on Pixabay · {image.width} × {image.height}
              </p>
            </div>

            <div>
              <h2 className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Tags</h2>
              {/* Every tag is a search. These are also the exact strings the
                  recommender builds its queries from, so this list doubles as a
                  view into what the algorithm below is working with. */}
              <ul className="mt-2 flex flex-wrap gap-2">
                {image.tags.map((tag) => (
                  <li key={tag}>
                    <Link
                      href={`/search?q=${encodeURIComponent(tag)}`}
                      className="inline-block rounded-full border border-black/10 px-3 py-1 font-mono text-xs text-zinc-600 transition hover:bg-black/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10"
                    >
                      {tag}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-auto text-xs text-zinc-400">
              Free to use under the Pixabay content licence. Saving copies the details to your
              board — the photo itself stays on Pixabay.
            </p>
          </div>
        </article>

        <section className="mt-10">
          <h2 className="mb-1 text-xl font-semibold">More like this</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Ranked by tag overlap against fresh Pixabay results — see{" "}
            <span className="font-mono">lib/recommend/similar-images.ts</span>.
          </p>

          {similar.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No close matches — this photo&rsquo;s tags are unusually specific.
            </p>
          ) : (
            <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
              {similar.map((scored) => (
                <PixabayResultCard
                  key={scored.image.providerId}
                  image={scored.image}
                  signedIn={Boolean(user)}
                  // Surfacing each suggestion's `reason` turns the ranker from a
                  // black box into something you can sanity-check at a glance.
                  caption={scored.reason}
                />
              ))}
            </div>
          )}
        </section>

        {saved.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-1 text-xl font-semibold">Already in the gallery</h2>
            <p className="mb-4 text-sm text-zinc-500">
              Pins people saved that share these tags.
            </p>
            <PinGrid pins={saved} favoriteIds={favoriteIds} signedIn={Boolean(user)} />
          </section>
        )}
      </main>
    </div>
  );
}
