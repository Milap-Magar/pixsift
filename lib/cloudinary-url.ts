// ── Cloudinary delivery URLs ────────────────────────────────────────────────
//
// Pure string manipulation — no SDK, no credentials, no `process.env`. That's
// deliberate: this is the one Cloudinary module safe to import anywhere,
// including client components.
//
// This is where "make it fast" actually happens. An untransformed Cloudinary
// URL serves the original file: a 4000px, 6MB JPEG straight into a 300px grid
// tile. Injecting a transformation makes Cloudinary resize, re-encode, and
// cache it at the edge — typically a 20-50× smaller payload for the grid.
//
//   original   .../upload/v1712/pixsift/dunes.jpg
//   transformed.../upload/f_auto,q_auto,c_limit,w_500,dpr_auto/v1712/pixsift/dunes.jpg
//
//   f_auto     serve AVIF/WebP to browsers that support it, JPEG to those that don't
//   q_auto     let Cloudinary choose the quality that looks identical but weighs less
//   c_limit    never scale UP past the original — c_fill would crop, c_scale would blur
//   w_<n>      the width we actually render at
//   dpr_auto   send 2× pixels to retina screens, 1× to everyone else

/** Matches the delivery path we can safely inject a transformation into. */
const CLOUDINARY_UPLOAD = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;

export type CdnImageOptions = {
  /** Rendered width in CSS pixels. */
  width?: number;
  /** Override the automatic quality (e.g. "auto:best" for the hero image). */
  quality?: string;
};

/**
 * Returns a size-appropriate URL for a Cloudinary asset.
 *
 * Anything that isn't a Cloudinary upload URL — a pasted picsum link, an image
 * on someone else's host — is returned untouched. So this is always safe to
 * call, and pins from either source render fine.
 */
export function cdnImage(url: string, options: CdnImageOptions = {}): string {
  const match = CLOUDINARY_UPLOAD.exec(url);
  if (!match) return url;

  const [, base, rest] = match;

  // Already transformed by us? Don't stack a second set on top.
  if (/^[a-z]_[^/]*\//.test(rest)) return url;

  const parts = ["f_auto", `q_${options.quality ?? "auto"}`, "c_limit", "dpr_auto"];
  if (options.width) parts.splice(3, 0, `w_${Math.round(options.width)}`);

  return `${base}${parts.join(",")}/${rest}`;
}

/** True when the URL is served by Cloudinary (so transformations will apply). */
export function isCloudinaryUrl(url: string): boolean {
  return CLOUDINARY_UPLOAD.test(url);
}
