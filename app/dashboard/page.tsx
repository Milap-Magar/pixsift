// THE DASHBOARD OVERVIEW ("/dashboard").
//
// The signed-in home. Three jobs, in this order:
//   1. tell you the state of your board in one screen
//   2. show what the algorithms found in it — coverage, colours, duplicates
//   3. get you posting again
//
// Guests never reach here: the layout redirects them (app/dashboard/layout.tsx).

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Copy,
  Heart,
  ImagePlus,
  MessageCircle,
  Palette,
  ScanSearch,
  Sparkles,
} from "lucide-react";

import AddPinDialog from "@/app/components/add-pin-dialog";
import PaletteStrip from "@/app/components/palette-strip";
import PinGrid from "@/app/components/pin-grid";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { dashboardStats } from "@/lib/dashboard";
import { getFavoriteIds } from "@/lib/pins";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

import ActivityChart from "./activity-chart";
import ColorBreakdown from "./color-breakdown";
import DiscoverRow from "./discover-row";

export const metadata = { title: "Dashboard · PixSift" };

export default async function DashboardPage() {
  // Its own session check, not a shortcut through the layout's.
  //
  // A layout does NOT gate the page it wraps: Next renders both in parallel, so
  // `redirect()` in app/dashboard/layout.tsx does not stop this function from
  // running first. Asserting the session was non-null here because "the layout
  // handles it" threw on every signed-out request — the response was still a
  // correct 307, but only because the redirect won the race to finish.
  const user = await currentUser();
  if (!user) redirect("/login");
  const stats = await dashboardStats(user);

  const favoriteIds = [...getFavoriteIds(user.id)];
  const postedThisFortnight = stats.activity.reduce((total, day) => total + day.pins, 0);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl leading-tight">
            {user.name.split(" ")[0]}&rsquo;s board
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.counts.mine} photo{stats.counts.mine === 1 ? "" : "s"} added ·{" "}
            {stats.counts.saved} saved · {postedThisFortnight} in the last fortnight
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

      {/* ── Stat row ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Your photos"
          value={stats.counts.mine}
          icon={<Sparkles className="size-4" />}
          href="/dashboard/pins"
        />
        <Stat
          label="Favourites"
          value={stats.counts.saved}
          icon={<Heart className="size-4" />}
          href="/dashboard/saved"
        />
        <Stat
          label="Comments received"
          value={stats.counts.comments}
          icon={<MessageCircle className="size-4" />}
          // Said out loud rather than left for the user to discover the hard
          // way. See the note at the top of lib/dashboard.ts.
          note="Resets when the server restarts"
        />
        <Stat
          label="Duplicate groups"
          value={stats.analysis.duplicateGroups}
          icon={<Copy className="size-4" />}
          href="/dashboard/duplicates"
          note={
            stats.analysis.duplicateGroups
              ? `${stats.analysis.duplicatePins} photos involved`
              : "Nothing looks repeated"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Posting activity ─────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your last fortnight</CardTitle>
            <CardDescription>
              {postedThisFortnight === 0
                ? "You haven't added anything in two weeks — the feed misses you."
                : `${postedThisFortnight} photo${postedThisFortnight === 1 ? "" : "s"} added in the last 14 days.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityChart data={stats.activity} />
          </CardContent>
        </Card>

        {/* ── Analysis coverage ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanSearch className="size-4" />
              Analysis
            </CardTitle>
            <CardDescription>
              Every photo gets a perceptual hash and a colour palette.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Coverage</span>
                <span className="font-mono text-sm">
                  {stats.analysis.analyzed}/{stats.analysis.total}
                </span>
              </div>
              <Progress value={stats.analysis.coverage * 100} />
            </div>

            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Hash size</dt>
                <dd className="font-mono">64 bits</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Duplicate threshold</dt>
                <dd className="font-mono">≤ {stats.analysis.threshold} bits</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Colours per photo</dt>
                <dd className="font-mono">5</dd>
              </div>
            </dl>

            {stats.analysis.analyzed < stats.analysis.total && (
              <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
                {stats.analysis.total - stats.analysis.analyzed} photo
                {stats.analysis.total - stats.analysis.analyzed === 1 ? "" : "s"} still to
                analyse. Run <code className="font-mono">bun run db:analyze</code> to catch up.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Colour breakdown ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4" />
              The colours you shoot
            </CardTitle>
            <CardDescription>
              Across every palette on your board, weighted by how much of each photo the
              colour actually covers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.palette.length ? (
              <>
                <ColorBreakdown data={stats.palette} />
                <Link
                  href="/colors"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  Browse everything by colour
                  <ArrowRight className="size-3.5" />
                </Link>
              </>
            ) : (
              <Empty
                icon={<Palette className="size-6 text-muted-foreground" />}
                title="No palettes yet"
                body="Add a photo and its five dominant colours appear here."
              />
            )}
          </CardContent>
        </Card>

        {/* ── Top pins ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Doing best</CardTitle>
            <CardDescription>Your photos, ranked by saves and comments.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.top.length ? (
              <ol className="flex flex-col gap-3">
                {stats.top.map(({ pin, saves, comments }, index) => (
                  <li key={pin.id} className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-center font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </span>

                    <Link
                      href={`/pin/${encodeURIComponent(pin.id)}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pin.thumbUrl ?? pin.imageUrl}
                        alt=""
                        className="size-10 shrink-0 rounded-md object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{pin.title}</span>
                        {pin.palette?.length ? (
                          <PaletteStrip palette={pin.palette} height="h-1.5" className="mt-1 max-w-24" />
                        ) : null}
                      </span>
                    </Link>

                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Heart className="size-3" />
                        {saves}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="size-3" />
                        {comments}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty
                icon={<Heart className="size-6 text-muted-foreground" />}
                title="No saves yet"
                body="Once people start saving your photos, your best ones show up here."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Something to post ──────────────────────────────────────────
          Placed ABOVE "recently added" on purpose. The recent grid is a record
          of what you've done; this is the thing to do next, and on a board with
          nothing in it the record is empty while this row still has something
          to offer. Renders nothing at all if Pixabay is unreachable. */}
      <DiscoverRow pins={stats.myPins} signedIn />

      {/* ── Recent ─────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          {/* "You added", not "Recently added". Everything on this page is
              about your own board, and the ambiguous heading is what let an
              earlier version quietly render other people's pins here without
              anyone noticing it was wrong. */}
          <h2 className="font-heading text-xl">Recently added by you</h2>
          <Link
            href="/dashboard/pins"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            See all
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <PinGrid
          pins={stats.myPins.slice(0, 12)}
          favoriteIds={favoriteIds}
          signedIn
          empty={
            <Empty
              icon={<ImagePlus className="size-6 text-muted-foreground" />}
              title="Nothing here yet"
              body="Add your first photo, or find one on the Discover page."
            />
          }
        />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  href,
  note,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
  note?: string;
}) {
  const body = (
    <Card className={cn("h-full", href && "transition hover:border-foreground/20 hover:shadow-sm")}>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-mono text-3xl leading-tight">{value}</span>
        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

function Empty({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
      {icon}
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
