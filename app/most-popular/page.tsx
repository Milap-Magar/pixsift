// THE MOST POPULAR PAGE ("/most-popular") — public leaderboard.
//
// The ranking itself lives in lib/popularity.ts (reading the clock in a
// component body is impure, and the logic is far easier to test on its own).
// This file is just the presentation.
//
// Every card shows its own save and comment counts, so the ordering is
// checkable at a glance rather than something you have to take on trust.

import Link from "next/link";
import { Flame, Heart, MessageCircle } from "lucide-react";

import PinGrid from "@/app/components/pin-grid";
import SiteHeader from "@/app/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { getFavoriteIds } from "@/lib/pins";
import {
  COMMENT_WEIGHT,
  POPULARITY_WINDOWS,
  SAVE_WEIGHT,
  isPopularityWindow,
  rankByPopularity,
  type PopularityWindow,
} from "@/lib/popularity";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Most popular · PixSift",
  description: "The most saved and most discussed pins on PixSift.",
};

export default async function MostPopularPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { window: windowParam } = await searchParams;
  const activeWindow: PopularityWindow = isPopularityWindow(windowParam) ? windowParam : "all";

  const user = await currentUser();
  const favoriteIds = user ? [...getFavoriteIds(user.id)] : [];

  const ranked = rankByPopularity(activeWindow);
  const engaged = ranked.filter((entry) => entry.score > 0);

  const captions = Object.fromEntries(
    ranked.map((entry) => [
      entry.pin.id,
      entry.score === 0
        ? "No saves yet"
        : `#${entry.rank} · ${entry.saves} ${entry.saves === 1 ? "save" : "saves"} · ${entry.comments} ${entry.comments === 1 ? "comment" : "comments"}`,
    ]),
  );

  const totalSaves = ranked.reduce((sum, entry) => sum + entry.saves, 0);
  const totalComments = ranked.reduce((sum, entry) => sum + entry.comments, 0);

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Flame className="size-5" />
              Most popular
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Heart className="size-3.5" />
                {totalSaves} {totalSaves === 1 ? "save" : "saves"}
              </span>
              <span className="flex items-center gap-1.5">
                <MessageCircle className="size-3.5" />
                {totalComments} {totalComments === 1 ? "comment" : "comments"}
              </span>
              <span>
                across {engaged.length} of {ranked.length} pins
              </span>
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            {POPULARITY_WINDOWS.map(({ key, label }) => {
              const active = key === activeWindow;
              return (
                <Link
                  key={key}
                  href={key === "all" ? "/most-popular" : `/most-popular?window=${key}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: active ? "secondary" : "ghost" }),
                    "h-9 rounded-full px-4 font-mono",
                    active && "ring-1 ring-black/10 dark:ring-white/15",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <PinGrid
          pins={ranked.map((entry) => entry.pin)}
          favoriteIds={favoriteIds}
          signedIn={Boolean(user)}
          captions={captions}
          empty={
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/10 py-20 text-center dark:border-white/15">
              <Flame className="size-7 text-zinc-400" />
              <p className="font-medium">Nothing in this window yet</p>
              <p className="max-w-xs text-sm text-zinc-500">
                Try &ldquo;All time&rdquo;, or add a pin to get things moving.
              </p>
            </div>
          }
        />

        <p className="mt-8 text-xs text-zinc-500">
          Ranked by {SAVE_WEIGHT} points per save and {COMMENT_WEIGHT} per comment. The window
          filters on when a pin was <em>posted</em> — the favourites store doesn&rsquo;t record
          when each save happened, so a true &ldquo;most saved this week&rdquo; needs timestamps on
          saves first.
        </p>
      </main>
    </div>
  );
}
