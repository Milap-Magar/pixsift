// THE DASHBOARD ("/dashboard") — the signed-in home. Protected two ways:
//   1. this Server Component redirects guests to /login, so the UI never shows
//   2. every mutation it can trigger (createPinAction, toggleFavoriteAction)
//      re-checks the session server-side — see app/actions/pins.ts
//
// The three views are driven by ?tab= rather than client state, so each one is a
// plain link, shareable and back-button friendly.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, ImagePlus, LayoutGrid, Plus, Sparkles } from "lucide-react";

import AddPinDialog from "@/app/components/add-pin-dialog";
import PinGrid from "@/app/components/pin-grid";
import SiteHeader from "@/app/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { getPinsByIds, listAllPins, listPins } from "@/lib/db/pins";
import { getFavoriteIds } from "@/lib/pins";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "all", label: "All pins", icon: LayoutGrid },
  { key: "mine", label: "My pins", icon: Sparkles },
  { key: "saved", label: "Favourites", icon: Heart },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: unknown): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export default async function DashboardPage({
  // In Next 16 `searchParams` is a Promise — it has to be awaited.
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { tab } = await searchParams;
  const activeTab: TabKey = isTabKey(tab) ? tab : "all";

  const favoriteIds = [...getFavoriteIds(user.id)];

  // Three independent reads, so they go in parallel rather than one after
  // another — `await`ing them in sequence would add up all three round trips to
  // Atlas for no reason.
  //
  // `viewerId` is what makes your own private pins show up here: MongoDB returns
  // every public pin plus everything of yours. See `visibleTo` in lib/db/pins.ts.
  const [allPins, mine, savedPins] = await Promise.all([
    listAllPins({ viewerId: user.id }),
    listPins({ authorId: user.id, viewerId: user.id, limit: 100 }),
    getPinsByIds(favoriteIds, user.id),
  ]);

  const myPins = mine.pins;

  const pins = activeTab === "mine" ? myPins : activeTab === "saved" ? savedPins : allPins;

  const counts: Record<TabKey, number> = {
    all: allPins.length,
    mine: myPins.length,
    saved: savedPins.length,
  };

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {user.name.split(" ")[0]}&rsquo;s board
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {counts.mine} added · {counts.saved} saved
            </p>
          </div>

          <AddPinDialog
            uploadEnabled={isCloudinaryConfigured()}
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-10 gap-1.5 rounded-full bg-red-600 px-5 font-mono text-white hover:bg-red-700",
            )}
          >
            <Plus className="size-4" />
            Add photo
          </AddPinDialog>
        </div>

        {/* Tabs — plain links, so the server does the filtering. */}
        <nav className="mb-6 flex flex-wrap gap-2">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = key === activeTab;
            return (
              <Link
                key={key}
                href={key === "all" ? "/dashboard" : `/dashboard?tab=${key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: active ? "secondary" : "ghost" }),
                  "h-9 gap-2 rounded-full px-4 font-mono",
                  active && "ring-1 ring-black/10 dark:ring-white/15",
                )}
              >
                <Icon className="size-4" />
                {label}
                <span className="text-xs text-zinc-500">{counts[key]}</span>
              </Link>
            );
          })}
        </nav>

        <PinGrid
          pins={pins}
          favoriteIds={favoriteIds}
          signedIn
          empty={<EmptyState tab={activeTab} />}
        />
      </main>
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const copy =
    tab === "saved"
      ? {
          title: "No favourites yet",
          body: "Tap the heart on any photo and it lands here.",
        }
      : {
          title: "You haven't added a photo yet",
          body: "Paste a link to any image to pin your first one.",
        };

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/10 py-20 text-center dark:border-white/15">
      {tab === "saved" ? (
        <Heart className="size-7 text-zinc-400" />
      ) : (
        <ImagePlus className="size-7 text-zinc-400" />
      )}
      <p className="font-medium">{copy.title}</p>
      <p className="max-w-xs text-sm text-zinc-500">{copy.body}</p>
    </div>
  );
}
