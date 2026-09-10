// Favourites — everything you've hearted, in one grid.
//
// Favourites are still stored in memory (lib/pins.ts), so this page is honest
// about the fact that the list does not survive a server restart. That note
// disappears the day the `favorites` collection lands; until then, an empty
// grid with no explanation would just look like a bug.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";

import PinGrid from "@/app/components/pin-grid";
import { getPinsByIds } from "@/lib/db/pins";
import { getFavoriteIds } from "@/lib/pins";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Favourites · PixSift" };

export default async function SavedPage() {
  // Its own session check, not a shortcut through the layout's.
  //
  // A layout does NOT gate the page it wraps: Next renders both in parallel, so
  // `redirect()` in app/dashboard/layout.tsx does not stop this function from
  // running first. Asserting the session was non-null here because "the layout
  // handles it" threw on every signed-out request — the response was still a
  // correct 307, but only because the redirect won the race to finish.
  const user = await currentUser();
  if (!user) redirect("/login");

  const favoriteIds = [...getFavoriteIds(user.id)];
  // Viewer-aware, which also quietly drops any favourite that has since become
  // unreachable — a deleted pin, or one whose author made it private after you
  // saved it. It simply isn't in the result.
  const pins = await getPinsByIds(favoriteIds, user.id);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header>
        <h1 className="font-heading text-3xl leading-tight">Favourites</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pins.length} photo{pins.length === 1 ? "" : "s"} saved.
        </p>
      </header>

      <PinGrid
        pins={pins}
        favoriteIds={favoriteIds}
        signedIn
        empty={
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
            <Heart className="size-7 text-muted-foreground" />
            <p className="font-medium">No favourites yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Tap the heart on any photo and it lands here.{" "}
              <Link href="/discover" className="underline underline-offset-2">
                Go and find some
              </Link>
              .
            </p>
          </div>
        }
      />
    </div>
  );
}
