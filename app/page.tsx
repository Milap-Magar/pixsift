// THE LANDING PAGE ("/") — a public Pinterest-style gallery.
//
// It's a Server Component: it reads the pins on the server and renders the HTML.
// Anyone can VIEW this. Adding and favouriting need an account — and the hearts
// on this page know it: signed out, tapping one opens the login dialog rather
// than silently failing.

import PinGrid from "@/app/components/pin-grid";
import SiteHeader from "@/app/components/site-header";
import { getFavoriteIds, getPins } from "@/lib/pins";
import { currentUser } from "@/lib/session";

export default async function Home() {
  const user = await currentUser();
  const pins = getPins();
  const favoriteIds = user ? [...getFavoriteIds(user.id)] : [];

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      {/* Full-bleed: padding only, no centred column, until the viewport passes
          --container-page (1660px). Every page uses this same wrapper. */}
      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <PinGrid pins={pins} favoriteIds={favoriteIds} signedIn={Boolean(user)} />
      </main>
    </div>
  );
}
