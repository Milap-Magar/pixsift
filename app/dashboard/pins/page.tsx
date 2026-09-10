// "My pins" — board management.
//
// Split from the overview because they answer different questions. The overview
// asks "how is my board doing"; this page is where you actually work on it, so
// it gets the full grid, the sort control, and the visibility badges rather
// than a twelve-tile preview.
//
// Sorting is a URL parameter, not client state: every view is a shareable link,
// the back button behaves, and the server does the ordering it is already best
// placed to do.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpDown, Globe, ImagePlus, Lock } from "lucide-react";

import AddPinDialog from "@/app/components/add-pin-dialog";
import PinGrid from "@/app/components/pin-grid";
import { buttonVariants } from "@/components/ui/button";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { listPins } from "@/lib/db/pins";
import { getFavoriteIds } from "@/lib/pins";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "My pins · PixSift" };

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "title", label: "A–Z" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

const isSortKey = (value: unknown): value is SortKey =>
  SORTS.some((sort) => sort.key === value);

export default async function MyPinsPage({
  // In Next 16 `searchParams` is a Promise — it has to be awaited.
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Its own session check, not a shortcut through the layout's.
  //
  // A layout does NOT gate the page it wraps: Next renders both in parallel, so
  // `redirect()` in app/dashboard/layout.tsx does not stop this function from
  // running first. Asserting the session was non-null here because "the layout
  // handles it" threw on every signed-out request — the response was still a
  // correct 307, but only because the redirect won the race to finish.
  const user = await currentUser();
  if (!user) redirect("/login");
  const { sort } = await searchParams;
  const activeSort: SortKey = isSortKey(sort) ? sort : "newest";

  // `viewerId` is what makes your own private pins appear here: the query
  // returns every public pin plus everything of yours. See `visibleTo` in
  // lib/db/pins.ts — it's the filter, not this page, that enforces the rule.
  const { pins } = await listPins({ authorId: user.id, viewerId: user.id, limit: 100 });

  // Newest-first comes straight off the `by_author_newest` index, so only the
  // other two orderings cost anything — and they cost a sort over at most 100
  // rows that are already in memory. Pushing them into Mongo would need an
  // index per ordering to avoid an in-memory SORT stage there instead, which is
  // a worse trade at this size.
  const sorted =
    activeSort === "oldest"
      ? [...pins].reverse()
      : activeSort === "title"
        ? [...pins].sort((a, b) => a.title.localeCompare(b.title))
        : pins;

  const privateCount = pins.filter((pin) => pin.visibility === "private").length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl leading-tight">My pins</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Globe className="size-3.5" />
              {pins.length - privateCount} public
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5" />
              {privateCount} private
            </span>
          </p>
        </div>

        <AddPinDialog
          uploadEnabled={isCloudinaryConfigured()}
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-10 gap-1.5 rounded-full bg-red-600 px-5 font-mono text-white hover:bg-red-700",
          )}
        >
          <ImagePlus className="size-4" />
          Add a photo
        </AddPinDialog>
      </header>

      <nav className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowUpDown className="size-3.5" />
          Sort
        </span>
        {SORTS.map(({ key, label }) => {
          const active = key === activeSort;
          return (
            <Link
              key={key}
              href={key === "newest" ? "/dashboard/pins" : `/dashboard/pins?sort=${key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: active ? "secondary" : "ghost" }),
                "h-8 rounded-full px-3 font-mono text-xs",
                active && "ring-1 ring-black/10 dark:ring-white/15",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <PinGrid
        pins={sorted}
        favoriteIds={[...getFavoriteIds(user.id)]}
        signedIn
        empty={
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
            <ImagePlus className="size-7 text-muted-foreground" />
            <p className="font-medium">You haven&rsquo;t added a photo yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Upload one from your device, paste a link, or save something from{" "}
              <Link href="/search" className="underline underline-offset-2">
                Find photos
              </Link>
              .
            </p>
          </div>
        }
      />
    </div>
  );
}
