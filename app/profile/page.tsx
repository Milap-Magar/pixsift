// THE PROFILE PAGE ("/profile") — your public-facing showcase.
//
// It used to be a bare "You are signed in ✅" stub with no header and no
// content, which is why it looked like nothing was there. Now it shows who you
// are, what you've contributed, and the actual pins behind those numbers.
//
// Still protected the same way: the session is read on the server and guests
// are redirected, which is the Next 16 recommendation (check close to the data,
// not only in middleware).

import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, ImagePlus, MessageCircle, Sparkles } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import PinGrid from "@/app/components/pin-grid";
import SiteHeader from "@/app/components/site-header";
import UserAvatar from "@/app/components/user-avatar";
import { buttonVariants } from "@/components/ui/button";
import { countCommentsByAuthor } from "@/lib/comments";
import { timeAgo } from "@/lib/format";
import { getFavoriteIds, getFavoritePins, getPinsByAuthor } from "@/lib/pins";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "pins", label: "Pins", icon: Sparkles },
  { key: "saved", label: "Favourites", icon: Heart },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: unknown): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export const metadata = { title: "Your profile · PixSift" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { tab } = await searchParams;
  const activeTab: TabKey = isTabKey(tab) ? tab : "pins";

  const myPins = getPinsByAuthor(user.id);
  const savedPins = getFavoritePins(user.id);
  const favoriteIds = [...getFavoriteIds(user.id)];
  const commentCount = countCommentsByAuthor(user.id);

  const pins = activeTab === "saved" ? savedPins : myPins;

  // "Member since" is only as good as our in-memory store, so derive it from the
  // oldest pin rather than inventing a signup date we never recorded.
  const oldestPin = myPins.at(-1);

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        {/* ── Identity ─────────────────────────────────────────────────── */}
        <section className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
          <UserAvatar name={user.name} image={user.image} size={96} />

          <div>
            <h1 className="text-3xl font-semibold">{user.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">{user.id}</p>
            {oldestPin && (
              <p className="mt-1 text-xs text-zinc-500">
                First pin{" "}
                <time
                  dateTime={new Date(oldestPin.createdAt).toISOString()}
                  suppressHydrationWarning
                >
                  {timeAgo(oldestPin.createdAt)}
                </time>
              </p>
            )}
          </div>

          <dl className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <Stat icon={<ImagePlus className="size-4" />} label="Pins" value={myPins.length} />
            <Stat icon={<Heart className="size-4" />} label="Favourites" value={savedPins.length} />
            <Stat
              icon={<MessageCircle className="size-4" />}
              label="Comments"
              value={commentCount}
            />
          </dl>

          <form action={signOutAction}>
            <button
              type="submit"
              className={cn(buttonVariants({ variant: "outline" }), "h-9 rounded-full px-5")}
            >
              Sign out
            </button>
          </form>
        </section>

        {/* ── Showcase ─────────────────────────────────────────────────── */}
        <nav className="mt-8 mb-4 flex flex-wrap gap-2">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = key === activeTab;
            const count = key === "saved" ? savedPins.length : myPins.length;

            return (
              <Link
                key={key}
                href={key === "pins" ? "/profile" : `/profile?tab=${key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: active ? "secondary" : "ghost" }),
                  "h-9 gap-2 rounded-full px-4 font-mono",
                  active && "ring-1 ring-black/10 dark:ring-white/15",
                )}
              >
                <Icon className="size-4" />
                {label}
                <span className="text-xs text-zinc-500">{count}</span>
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

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center">
      <dt className="flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const copy =
    tab === "saved"
      ? { title: "No favourites yet", body: "Tap the heart on any photo and it shows up here." }
      : { title: "No pins yet", body: "Add your first photo and it'll headline your profile." };

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
