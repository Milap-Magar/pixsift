// The photo panel beside the sign-in form.
//
// ── Why real pins and not picsum ─────────────────────────────────────────
// This used to be <PhotoWall>: twenty picsum.photos requests, fired on open,
// animated by JavaScript. docs/ROADMAP.md called it out as the heaviest thing
// on the page, and it was also dishonest — the first impression of PixSift was
// twenty photographs that had nothing to do with PixSift.
//
// These are real pins, already on our own CDN, already sized by `cdnImage`, and
// fetched by the page as part of a render it was doing anyway. Fewer bytes,
// no third-party host on the critical path, and a landing page that shows what
// is actually inside.
//
// A Server Component with no animation. The motion here was decoration on the
// one screen where the job is "sign in", and a moving background behind a form
// is a thing to look past rather than at.

import { cdnImage } from "@/lib/cloudinary-url";
import type { SavedPin } from "@/lib/db/pins";

export default function LoginShowcase({ pins }: { pins: SavedPin[] }) {
  if (!pins.length) return null;

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {/* Masonry via CSS columns — no layout JS, and it degrades to a single
          column on narrow viewports where this panel is hidden anyway. */}
      <div className="columns-2 gap-3 p-3 lg:columns-3 [&>*]:mb-3">
        {pins.map((pin, index) => (
          <div key={pin.id} className="overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cdnImage(pin.imageUrl, { width: 400 })}
              alt=""
              width={pin.width}
              height={pin.height}
              className="h-auto w-full object-cover"
              // The first few are above the fold on a desktop viewport, so they
              // load eagerly; the rest wait. `fetchPriority="high"` on none of
              // them — this is a background, and it must never outrank the form.
              loading={index < 4 ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ))}
      </div>

      {/* The scrim. A gradient rather than a flat overlay so the photos stay
          legible at the top and the copy stays legible at the bottom. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" />
    </div>
  );
}
