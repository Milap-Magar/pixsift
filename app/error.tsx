"use client";

// Error boundaries must be Client Components — this one catches anything thrown
// while rendering a page, its nested layouts, or its loading UI. It does NOT
// catch the root layout (nothing below it can); that would need global-error.tsx.
//
// Being a Client Component is also why there's no <SiteHeader> here: the header
// is an async Server Component that reads the session, and a client boundary
// can't render one. So this page carries its own way out.

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function Error({
  error,
  // Next 16 renamed this from `reset`. `unstable_retry` re-fetches AND
  // re-renders the segment, which is what a failed database or Pixabay call
  // actually needs — `reset` only clears the error state and re-renders with
  // the same failed data, so it would just throw again.
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // In production the message is stripped before it reaches the client, so
    // this is mostly the digest — which is the value that matches the real
    // stack trace in the server logs.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 p-6 text-center dark:bg-black">
      <div className="grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
        <TriangleAlert className="size-6" />
      </div>

      <h1 className="text-2xl font-medium">Something went wrong</h1>
      <p className="max-w-sm text-sm text-zinc-500">
        This is usually the database or Pixabay timing out rather than anything
        you did. Trying again often works.
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          <RotateCcw className="size-4" />
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full px-5 py-2.5 text-sm font-medium ring-1 ring-black/10 transition hover:bg-white dark:ring-white/15 dark:hover:bg-zinc-900"
        >
          Back to the wall
        </Link>
      </div>

      {/* The one piece of the error that survives to production, and the only
          thing worth quoting in a bug report. */}
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-zinc-400">Reference: {error.digest}</p>
      )}
    </div>
  );
}
