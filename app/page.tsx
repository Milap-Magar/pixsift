// THE LANDING PAGE ("/") — a public Pinterest-style gallery.
//
// It's a Server Component: it reads the pins on the server and renders the HTML.
// Anyone can VIEW this. The "+ Add pin" action in the header only appears / is
// only usable when logged in (and the API enforces that too).

import SiteHeader from "@/app/components/site-header";
import { getPins } from "@/lib/pins";

export default function Home() {
  const pins = getPins();

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <main className="flex-1 p-4 sm:p-6">
        {/* Masonry layout via CSS columns — the classic Pinterest look.
            Each card can be a different height and they tile nicely. */}
        <div className="columns-2 gap-4 *:mb-4 sm:columns-3 lg:columns-4">
          {pins.map((pin) => (
            <figure
              key={pin.id}
              className="group break-inside-avoid overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10"
            >
              {/* Plain <img> (not next/image) so we don't need to configure
                  remote image domains for this demo. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pin.imageUrl}
                alt={pin.title}
                className="w-full object-cover transition group-hover:opacity-90"
                loading="lazy"
              />
              <figcaption className="p-3">
                <p className="font-medium leading-tight">{pin.title}</p>
                <p className="mt-1 text-xs text-zinc-500">by {pin.author}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </main>
    </div>
  );
}
