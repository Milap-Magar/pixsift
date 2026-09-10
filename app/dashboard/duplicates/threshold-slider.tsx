"use client";

// The live threshold control.
//
// Drag it and the clusters merge and split in front of you. That is the whole
// point: the threshold is the one judgement call in the near-duplicate
// detector, and a slider turns an argument about a constant into something you
// can watch happen.
//
// ── Why the clustering is redone in the browser ──────────────────────────
// The page hands down every pin's 64-bit hash — sixteen characters each, so a
// 500-image library is about 8KB — and re-runs `clusterDuplicates` on each
// change. The alternative, a round trip per drag step, would put 20 requests
// between the user and one gesture and would feel broken.
//
// This is only possible because lib/algorithms/hamming.ts is a pure function of
// its arguments: no database, no clock, no I/O. The identical code runs on the
// server for the initial render and in the browser for every subsequent step,
// and cannot disagree with itself.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";

import HashGrid from "@/app/components/hash-grid";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  classify,
  clusterDuplicates,
  hammingDistance,
  DUPLICATE_THRESHOLD,
  IDENTICAL_THRESHOLD,
} from "@/lib/algorithms/hamming";
import { HASH_BITS } from "@/lib/algorithms/phash";
import { cdnImage } from "@/lib/cloudinary-url";
import { cn } from "@/lib/utils";

export type DuplicateCandidate = {
  id: string;
  phash: string;
  title: string;
  imageUrl: string;
};

/** How far the slider goes. Past ~24 everything merges into one useless blob. */
const MAX_THRESHOLD = 24;

export default function ThresholdSlider({ items }: { items: DuplicateCandidate[] }) {
  const [threshold, setThreshold] = useState(DUPLICATE_THRESHOLD);

  // Recomputed only when the threshold actually changes, not on every render.
  // At 500 items this is 125,000 Hamming comparisons — a few milliseconds, but
  // a few milliseconds on every keystroke elsewhere on the page would be waste.
  const groups = useMemo(() => clusterDuplicates(items, threshold), [items, threshold]);

  const flagged = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="threshold" className="text-sm font-medium">
              Hamming distance threshold
            </label>
            <span className="font-mono text-sm">
              ≤ {threshold} / {HASH_BITS} bits
            </span>
          </div>

          <input
            id="threshold"
            type="range"
            min={0}
            max={MAX_THRESHOLD}
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-red-600"
          />

          <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>0 · identical bytes</span>
            <span>{HASH_BITS / 2} · unrelated</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary" className="font-mono">
              {groups.length} group{groups.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="secondary" className="font-mono">
              {flagged} photo{flagged === 1 ? "" : "s"}
            </Badge>
            {threshold !== DUPLICATE_THRESHOLD && (
              <button
                type="button"
                onClick={() => setThreshold(DUPLICATE_THRESHOLD)}
                className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Reset to the shipped threshold ({DUPLICATE_THRESHOLD})
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {threshold < IDENTICAL_THRESHOLD
              ? "Strict: only re-encodings and exact copies are caught. Resized or cropped versions slip through."
              : threshold <= DUPLICATE_THRESHOLD
                ? "The shipped range. Every ordinary edit — re-encoding, resizing, brightness, small crops — is caught, and nothing unrelated is."
                : threshold <= 18
                  ? "Loose: heavy crops and watermarked copies start being caught too. Still no false positives on this library, but the margin is thinning."
                  : "Too loose. Unrelated photographs begin to link, and single-linkage clustering then chains them into groups that share nothing."}
          </p>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <Copy className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Nothing looks repeated at this threshold</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {threshold < DUPLICATE_THRESHOLD
              ? "Try dragging the slider right — near-duplicates that survived an edit sit a few bits away, not zero."
              : "Your library has no near-duplicates."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((group) => (
            <Group key={group.items[0].id} items={group.items} maxDistance={group.maxDistance} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Group({
  items,
  maxDistance,
}: {
  items: DuplicateCandidate[];
  maxDistance: number;
}) {
  // The first member is the reference every distance below is measured against.
  // An arbitrary choice, but a stated one — "distance 6" is meaningless without
  // saying "from what".
  const [reference, ...rest] = items;

  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {items.length} photos
            </Badge>
            <span className="text-xs text-muted-foreground">
              widest pair in this group: {maxDistance} bits
            </span>
          </div>

          <div className="flex flex-wrap gap-4">
            <Member item={reference} label="reference" />

            {rest.map((item) => {
              const distance = hammingDistance(reference.phash, item.phash);
              return (
                <Member
                  key={item.id}
                  item={item}
                  distance={distance}
                  // The reference's bits, so differing squares light up red —
                  // an 8×8 diff of two 64-bit hashes.
                  diffAgainst={reference.phash}
                  label={`${distance} bits · ${classify(distance)}`}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function Member({
  item,
  label,
  distance,
  diffAgainst,
}: {
  item: DuplicateCandidate;
  label: string;
  distance?: number;
  diffAgainst?: string;
}) {
  return (
    <div className="flex w-32 flex-col gap-2">
      <Link
        href={`/pin/${encodeURIComponent(item.id)}`}
        className="overflow-hidden rounded-lg ring-1 ring-black/5 transition hover:opacity-90 dark:ring-white/10"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cdnImage(item.imageUrl, { width: 256 })}
          alt={item.title}
          className="aspect-square w-full object-cover"
        />
      </Link>

      <div className="flex items-center gap-2">
        <HashGrid hash={item.phash} diffAgainst={diffAgainst} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={item.title}>
            {item.title}
          </p>
          <p
            className={cn(
              "font-mono text-[10px]",
              distance === undefined
                ? "text-muted-foreground"
                : distance <= IDENTICAL_THRESHOLD
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-blue-600 dark:text-blue-400",
            )}
          >
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
