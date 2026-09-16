// ONE OF YOUR PHOTOS, inside the dashboard.
//
// /pin/[id] is the gallery view: public, sociable, with comments and "more like
// this" under it. This is the workshop view of the same photograph — what it is,
// what we know about it, and the controls that change it, without leaving the
// rail you were working in. Clicking a tile on "My pins" lands here, and after a
// delete you are still on the dashboard rather than staring at a 404 in the
// public gallery.
//
// It is scoped to YOUR pins on purpose. Someone else's photo has nothing here to
// manage, so it redirects to the page that does have something to offer.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Link2,
  Lock,
  Palette,
  Sparkles,
} from "lucide-react";

import DeletePinButton from "@/app/components/delete-pin-button";
import DownloadMenu from "@/app/components/download-menu";
import HashGrid from "@/app/components/hash-grid";
import PaletteStrip from "@/app/components/palette-strip";
import VisibilityToggle from "@/app/components/visibility-toggle";
import { HASH_BITS } from "@/lib/algorithms/phash";
import { cdnImage, isCloudinaryUrl } from "@/lib/cloudinary-url";
import { getPinById } from "@/lib/db/pins";
import { timeAgo } from "@/lib/format";
import { currentUser } from "@/lib/session";

const actionButtonClasses =
  "flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition hover:bg-muted";

/**
 * No `openGraph`, and a deliberately plain title: this route is behind the
 * dashboard's redirect, and a private photo's title has no business in a link
 * preview even for a page nobody else can open.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const pin = user ? await getPinById(id, user.id) : null;

  return { title: pin ? `${pin.title} · My pins · PixSift` : "My pins · PixSift" };
}

/** What "where did this come from" should say, and whether we hold the file. */
const SOURCES = {
  upload: { label: "Uploaded by you", icon: ImageIcon, ownsFile: true },
  link: { label: "Linked from the web", icon: Link2, ownsFile: false },
  seed: { label: "Sample photo", icon: Sparkles, ownsFile: false },
} as const;

export default async function DashboardPinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Its own session check, not a shortcut through the layout's — a layout does
  // not gate the page it wraps, since Next renders both in parallel.
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  // Viewer-aware, so your own private pin resolves here and a stranger's private
  // pin is simply "no such pin" — the same answer it gives everywhere else.
  const pin = await getPinById(id, user.id);
  if (!pin) notFound();

  // Visible, but not yours: there is nothing to manage, so hand it to the page
  // that can actually do something with it. Note this is a courtesy, not a
  // guard — the delete behind the button re-checks ownership in its own query.
  if (pin.authorId !== user.id) redirect(`/pin/${encodeURIComponent(pin.id)}`);

  const source = SOURCES[pin.source];
  const SourceIcon = source.icon;
  const isPrivate = pin.visibility === "private";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <Link
        href="/dashboard/pins"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        My pins
      </Link>

      <article className="grid gap-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] dark:bg-zinc-900 dark:ring-white/10">
        <div className="bg-zinc-100 dark:bg-black/40">
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
          <div>
            <h1 className="font-heading text-3xl leading-tight">{pin.title}</h1>
            {pin.description && (
              <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">
                {pin.description}
              </p>
            )}

            <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <SourceIcon className="size-3.5" />
                <dd>{source.label}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                {isPrivate ? <Lock className="size-3.5" /> : <Globe className="size-3.5" />}
                <dd>{isPrivate ? "Private" : "Public"}</dd>
              </div>
              <dd>
                <time dateTime={new Date(pin.createdAt).toISOString()} suppressHydrationWarning>
                  {timeAgo(pin.createdAt)}
                </time>
              </dd>
              {pin.width && pin.height && (
                <dd className="font-mono text-xs">
                  {pin.width} × {pin.height}
                </dd>
              )}
            </dl>
          </div>

          {/* ── The controls ────────────────────────────────────────────────
              Delete sits apart from the rest, after a rule: it is the one
              control here that cannot be pressed twice, and putting it in the
              same row as Download invites the misclick. */}
          <div className="flex flex-wrap items-center gap-2">
            <VisibilityToggle pinId={pin.id} visibility={pin.visibility} />

            <DownloadMenu
              href={`/api/pins/${encodeURIComponent(pin.id)}/download`}
              resizable={isCloudinaryUrl(pin.imageUrl)}
              maxWidth={pin.width}
              className={actionButtonClasses}
            />

            <Link href={`/pin/${encodeURIComponent(pin.id)}`} className={actionButtonClasses}>
              <ExternalLink className="size-4" />
              {isPrivate ? "Preview page" : "Public page"}
            </Link>
          </div>

          {isPrivate && (
            <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
              <Lock className="size-3.5 shrink-0" />
              Only you can see this one. It stays out of the feed, search and
              recommendations.
            </p>
          )}

          {/* Algorithm 3, made visible — the same palette the colour search
              runs on, on the page where you'd think to look for it. */}
          {pin.palette?.length ? (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">
                <Palette className="size-3.5" />
                Dominant colours
              </h2>
              <PaletteStrip palette={pin.palette} showLabels height="h-12" />
            </section>
          ) : null}

          {pin.phash && (
            <section className="flex items-center gap-3">
              <HashGrid hash={pin.phash} size={48} />
              <div>
                <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                  Perceptual hash
                </h2>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">{pin.phash}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  The {HASH_BITS} bits that let{" "}
                  <Link href="/dashboard/duplicates" className="underline underline-offset-2">
                    duplicate detection
                  </Link>{" "}
                  recognise a resized copy of this photo.
                </p>
              </div>
            </section>
          )}

          <hr className="border-black/5 dark:border-white/10" />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Delete this photo</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {source.ownsFile
                  ? "Removes the pin and the uploaded file. There's no undo."
                  : "Removes the pin. The image stays where it's hosted."}
              </p>
            </div>

            <DeletePinButton
              pinId={pin.id}
              pinTitle={pin.title}
              removesFile={source.ownsFile}
              redirectTo="/dashboard/pins"
            />
          </div>
        </div>
      </article>
    </div>
  );
}
