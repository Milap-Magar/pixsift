"use client";

// "You may already have this one."
//
// The moment the perceptual hash earns its place in the product. Between
// pressing Add and the pin being written, the image is hashed and compared
// against everything already in your library (lib/algorithms/pipeline.ts). If
// something comes back within the threshold, the post pauses here.
//
// ── Why it's a warning and not a block ───────────────────────────────────
// Because the algorithm is a good guess, not an oracle. Two frames from the
// same burst are genuinely near-identical and a photographer may well want
// both. Refusing the post would make a 91%-recall classifier into a rule, and
// the 9% it misjudges would have no way around it. So this shows its work —
// the match, the distance, and how sure it is — and leaves the decision to the
// person, who can see both images and knows which they meant.
//
// Showing the actual bit distance is deliberate. "Probably a duplicate" invites
// a shrug; "6 bits different out of 64" invites a judgement, and it is the same
// number the report is built on.

import Link from "next/link";
import { AlertTriangle, ArrowRight, Copy } from "lucide-react";

import type { DuplicateWarning as Warning } from "@/lib/algorithms/pipeline";
import { cdnImage } from "@/lib/cloudinary-url";
import { HASH_BITS } from "@/lib/algorithms/phash";
import { cn } from "@/lib/utils";

export default function DuplicateWarning({
  warning,
  onDismiss,
  className,
}: {
  warning: Warning;
  /** Called by "Let me change it" — clears the warning so the form is editable again. */
  onDismiss: () => void;
  className?: string;
}) {
  const identical = warning.verdict === "identical";

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-3",
        identical
          ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          : "border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {identical ? (
          <Copy className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
        )}

        <div className="flex-1">
          <p className="text-sm font-medium">
            {identical ? "You already have this photo" : "This looks a lot like one of yours"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {warning.distance === 0
              ? "The perceptual hash is an exact match."
              : `${warning.distance} of ${HASH_BITS} hash bits differ — ${
                  identical ? "almost certainly the same picture" : "close enough to be worth a look"
                }.`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-background/70 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cdnImage(warning.imageUrl, { width: 96 })}
          alt=""
          className="size-12 shrink-0 rounded-md object-cover"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{warning.title}</p>
          <Link
            href={`/pin/${encodeURIComponent(warning.pinId)}`}
            // The existing pin opens in a new tab on purpose: this dialog holds
            // a half-finished form, and navigating away in place would throw
            // away the title and description the user has already typed.
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Open the one you have
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Press <span className="font-medium text-foreground">Add anyway</span> to post it
        regardless — near-duplicates are sometimes exactly what you want.
      </p>

      <button
        type="button"
        onClick={onDismiss}
        className="cursor-pointer self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Let me change it instead
      </button>
    </div>
  );
}
