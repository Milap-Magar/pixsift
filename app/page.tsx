// THE LANDING PAGE ("/") — a public, endless Pinterest-style wall.
//
// It's a Server Component: it reads the first page on the server and renders the
// HTML. Anyone can VIEW this. Saving needs an account — and the tiles know it:
// signed out, the heart opens the login dialog rather than silently failing.
//
// The feed plays saved pins from MongoDB first, then keeps going with live
// Pixabay photos, all behind one cursor. See lib/feed.ts.

import Link from "next/link";
import { ImagePlus } from "lucide-react";

import InfiniteFeed from "@/app/components/infinite-feed";
import SiteHeader from "@/app/components/site-header";
import { getFeedPage } from "@/lib/feed";
import { getFavoriteIds } from "@/lib/pins";
import { currentUser } from "@/lib/session";

/** One screenful-ish. Small enough to render fast, big enough to fill a 6-column wall. */
const PAGE_SIZE = 30;

export default async function Home() {
  const user = await currentUser();

  const { items, nextCursor } = await getFeedPage(null, PAGE_SIZE);
  const favoriteIds = user ? [...getFavoriteIds(user.id)] : [];

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      {/* Full-bleed: padding only, no centred column, until the viewport passes
          --container-page (1660px). Every page uses this same wrapper. */}
      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <InfiniteFeed
          initialItems={items}
          initialCursor={nextCursor}
          favoriteIds={favoriteIds}
          signedIn={Boolean(user)}
          // Every other grid in the app passes one of these; the landing page
          // was the exception, so a cold database rendered a blank screen —
          // the worst possible first impression, and indistinguishable from a
          // page that failed to load. This is also what a visitor sees when
          // PIXABAY_API_KEY is missing and there are no saved pins to fall
          // back on, which is the likeliest way to hit it in practice.
          empty={
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/10 py-24 text-center dark:border-white/15">
              <ImagePlus className="size-7 text-zinc-400" />
              <p className="font-medium">The wall is empty</p>
              <p className="max-w-xs text-sm text-zinc-500">
                Nothing has been posted yet. Add the first photo, or pull one in
                from{" "}
                <Link href="/search" className="underline underline-offset-2">
                  Find photos
                </Link>
                .
              </p>
            </div>
          }
        />
      </main>
    </div>
  );
}
