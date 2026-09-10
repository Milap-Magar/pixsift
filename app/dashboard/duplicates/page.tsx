// THE DUPLICATE REVIEW QUEUE ("/dashboard/duplicates").
//
// Algorithms 1 and 2 with the lid off. Every near-duplicate group in the
// library, the actual Hamming distance between each pair, both 64-bit hashes
// drawn as 8×8 grids with the differing bits picked out in red, and a slider
// that re-clusters the whole library live.
//
// It is also the tool that produced the threshold. Dragging the slider and
// watching where groups start merging is how `DUPLICATE_THRESHOLD` was chosen
// before the numbers in docs/algorithms/EVALUATION.md confirmed it.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ScanSearch } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { DUPLICATE_THRESHOLD } from "@/lib/algorithms/hamming";
import { HASH_BITS } from "@/lib/algorithms/phash";
import { analysisCoverage, listPinHashes } from "@/lib/db/pins";
import { currentUser } from "@/lib/session";

import ThresholdSlider from "./threshold-slider";

export const metadata = { title: "Duplicates · PixSift" };

export default async function DuplicatesPage() {
  // Its own session check, not a shortcut through the layout's.
  //
  // A layout does NOT gate the page it wraps: Next renders both in parallel, so
  // `redirect()` in app/dashboard/layout.tsx does not stop this function from
  // running first. Asserting the session was non-null here because "the layout
  // handles it" threw on every signed-out request — the response was still a
  // correct 307, but only because the redirect won the race to finish.
  const user = await currentUser();
  if (!user) redirect("/login");

  const [hashes, coverage] = await Promise.all([
    // Scoped to what this viewer may see. Near-duplicate detection is by
    // construction a way to ask "is there an image like this one?", so an
    // unscoped version would be a way to learn that someone else's private pin
    // exists. The filter lives in the query — see `visibleTo` in lib/db/pins.ts.
    listPinHashes({ viewerId: user.id }),
    analysisCoverage(user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="font-heading text-3xl leading-tight">Near-duplicates</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every photo carries a {HASH_BITS}-bit perceptual hash — a fingerprint of what it
          looks like, not of its bytes. Two photos are near-duplicates when few enough
          of those bits differ. That count is the{" "}
          <span className="font-medium text-foreground">Hamming distance</span>, and the
          slider below is the line we draw through it.
        </p>
      </header>

      {coverage.analyzed < coverage.total && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <ScanSearch className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">
              {coverage.total - coverage.analyzed} of {coverage.total} photos have no hash
              yet, so they can&rsquo;t be compared. Run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                bun run db:analyze
              </code>{" "}
              to fill them in.
            </span>
          </CardContent>
        </Card>
      )}

      {hashes.length < 2 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-20 text-center">
          <ScanSearch className="size-7 text-muted-foreground" />
          <p className="font-medium">Not enough analysed photos to compare</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Duplicate detection needs at least two hashed photos. Add a few and they
            appear here automatically.
          </p>
        </div>
      ) : (
        <ThresholdSlider items={hashes} />
      )}

      <Card>
        <CardContent className="flex flex-col gap-2 p-5 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              Why {DUPLICATE_THRESHOLD} out of {HASH_BITS}?
            </span>{" "}
            Because every ordinary edit — re-encoding, resizing, format changes, ±20%
            brightness, a 5% crop — lands at or below 8 bits, while the closest pair of
            genuinely different photographs in this library sits at 20. Ten is inside
            that margin with room on both sides.
          </p>
          <Link
            href="/docs"
            className="inline-flex w-fit items-center gap-1.5 text-foreground underline-offset-2 hover:underline"
          >
            The full precision/recall sweep is in docs/algorithms/EVALUATION.md
            <ArrowRight className="size-3.5" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
