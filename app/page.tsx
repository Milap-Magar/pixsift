// THE LANDING PAGE ("/") — a public, endless Pinterest-style wall.
//
// It's a Server Component: it reads the first page on the server and renders the
// HTML. Anyone can VIEW this. Saving needs an account — and the tiles know it:
// signed out, the heart opens the login dialog rather than silently failing.
//
// The feed plays saved pins from MongoDB first, then keeps going with live
// Pixabay photos, all behind one cursor. See lib/feed.ts.

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
        />
      </main>
    </div>
  );
}
