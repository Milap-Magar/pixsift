"use client";

// The strip under an infinite list: the sentinel the observer watches, plus
// whatever the list is currently doing. Shared so the feed and the pin grid
// can't drift apart.

import type { RefObject } from "react";

const buttonClasses =
  "cursor-pointer rounded-full border border-black/10 px-4 py-1.5 font-mono text-zinc-700 transition hover:bg-black/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10";

export default function InfiniteStatus({
  sentinel,
  loading,
  error,
  done,
  onRetry,
  doneLabel = "You're all caught up.",
}: {
  sentinel: RefObject<HTMLDivElement | null>;
  loading: boolean;
  error: string | null;
  done: boolean;
  onRetry: () => void;
  doneLabel?: string;
}) {
  return (
    <>
      {/* What the observer watches. Kept outside the grid so it isn't laid out
          as a masonry column. */}
      <div ref={sentinel} aria-hidden className="h-px" />

      {/* Screen readers get told what happened; sighted users see it too. */}
      <div aria-live="polite" className="py-10 text-center text-sm text-zinc-500">
        {error ? (
          <span className="flex flex-col items-center gap-2">
            {error}
            <button type="button" onClick={onRetry} className={buttonClasses}>
              Try again
            </button>
          </span>
        ) : loading ? (
          "Loading more…"
        ) : done ? (
          doneLabel
        ) : (
          // The fallback path: if IntersectionObserver never fires — reduced
          // data mode, an odd browser, a very tall viewport — this still works.
          <button type="button" onClick={onRetry} className={buttonClasses}>
            Load more
          </button>
        )}
      </div>
    </>
  );
}
