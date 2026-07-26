// Shown while the details page waits on Pixabay.
//
// The page makes up to four network calls (the image, three candidate searches),
// and the first visitor to a given photo pays for all of them uncached. Without
// this the router would sit on the previous screen for that whole time, which
// reads as a dead click. The skeleton mirrors the real layout so nothing jumps
// when the content lands.

import SiteHeader from "@/app/components/site-header";

export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="mx-auto w-full max-w-page flex-1 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 md:grid-cols-2 dark:bg-zinc-900 dark:ring-white/10">
          <div className="aspect-[4/3] animate-pulse bg-zinc-200 dark:bg-zinc-800" />

          <div className="flex flex-col gap-6 p-6">
            <div className="h-10 w-2/3 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-8 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="h-7 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800"
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 h-7 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </main>
    </div>
  );
}
