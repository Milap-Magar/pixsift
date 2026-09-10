// The 404. Reached two ways: a URL that matches no route at all, and any
// `notFound()` call that isn't caught by a closer not-found.tsx — which is how
// /pin/[id] and /photo/[id] already handle an id that doesn't resolve.
//
// It renders <SiteHeader> like every other page. That header is an async Server
// Component that reads the session, so it does pin this route to server-rendered
// rather than prerendered — but `/_not-found` is already dynamic in this app
// (check `next build`: every route is), so it costs nothing here, and a 404 that
// keeps the nav is a 404 you can leave without pressing Back.

import Link from "next/link";
import { Compass, ImageOff } from "lucide-react";

import SiteHeader from "@/app/components/site-header";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <ImageOff className="size-6" />
        </div>

        <h1 className="text-2xl font-medium">This page isn&rsquo;t here</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          The link may be broken, or the pin behind it was removed or made private.
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Back to the wall
          </Link>
          <Link
            href="/discover"
            className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium ring-1 ring-black/10 transition hover:bg-white dark:ring-white/15 dark:hover:bg-zinc-900"
          >
            <Compass className="size-4" />
            Discover
          </Link>
        </div>
      </main>
    </div>
  );
}
