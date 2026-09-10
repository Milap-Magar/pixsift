// Download a DISCOVERED photo — one from Pixabay that nobody has saved yet.
//
//   GET /api/photos/<pixabay id>/download?size=medium
//
// The sibling route (/api/pins/[id]/download) serves images we hold a row for.
// This one serves images we don't: the /search and /photo/[id] pages render
// live Pixabay results, and until someone saves one there is no pin id to ask
// for. Without this route those pages are the only place in the app where the
// download button has to be missing, which is exactly where a visitor most
// wants one.
//
// ── The id is a lookup key, not a URL ─────────────────────────────────────
// This route takes a Pixabay IMAGE ID and asks Pixabay what its URL is. It very
// deliberately does not take a URL as a parameter. A route that fetched and
// returned any URL a caller handed it is an open proxy: it would let anyone use
// this server to fetch arbitrary addresses — including ones only this server can
// reach, like a cloud provider's metadata endpoint — with our IP and our
// credentials. Resolving the id through `getImageById` means the only URLs that
// can ever be fetched are ones Pixabay's own API returned.
//
// ── Sizes ─────────────────────────────────────────────────────────────────
// Pixabay publishes fixed renditions rather than an on-the-fly resizer, so the
// requested size is mapped onto the nearest one they offer rather than being
// generated. `original` is `largeImageURL`, their full-resolution file.

import {
  EXTENSION_BY_TYPE,
  contentDisposition,
  parseDownloadSize,
  slugifyFilename,
} from "@/lib/download";
import { getImageById, isPixabayConfigured } from "@/lib/pixabay";

export async function GET(request: Request, ctx: RouteContext<"/api/photos/[id]/download">) {
  if (!isPixabayConfigured()) {
    return Response.json({ error: "Photo search isn't configured." }, { status: 503 });
  }

  const { id } = await ctx.params;
  const size = parseDownloadSize(new URL(request.url).searchParams.get("size"));

  let image;
  try {
    image = await getImageById(id);
  } catch {
    return Response.json({ error: "Couldn't reach the photo service." }, { status: 502 });
  }

  if (!image) return Response.json({ error: "No such photo." }, { status: 404 });

  // `webformatURL` is ~640px, `largeImageURL` is full size. Two renditions, so
  // "small" and "medium" both resolve to the smaller one — the menu is told
  // which sizes are real (see <DownloadMenu resizable={false}>) rather than
  // offering four choices that deliver two distinct files.
  const source = size === "small" || size === "medium" ? image.imageUrl : image.largeUrl;

  let upstream: Response;
  try {
    upstream = await fetch(source, {
      headers: { "User-Agent": "PixSift" },
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the image." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: `The image host returned ${upstream.status}.` }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return Response.json({ error: "That URL isn't an image." }, { status: 415 });
  }

  const extension = EXTENSION_BY_TYPE[contentType.split(";")[0]] ?? "jpg";

  // The photographer's name goes in the filename. Pixabay's licence does not
  // require attribution, but a file that arrives called
  // `misty-forest-by-jane-doe.jpg` keeps the credit attached to the image after
  // it has left the site — which is the point at which attribution normally
  // gets lost.
  const credit = image.credit.name ? `-by-${slugifyFilename(image.credit.name)}` : "";
  const filename = `${slugifyFilename(image.title)}${credit}.${extension}`;

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(filename),
      // Public and cacheable, unlike the pin route: the response depends only
      // on the id and the size, never on who is asking. Pixabay requires their
      // API responses be cached for 24h, and caching the image alongside it
      // keeps repeat downloads off their servers entirely.
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      // Where the image came from, for anyone inspecting the response.
      "X-Source-Page": image.pageUrl,
      ...(upstream.headers.get("content-length")
        ? { "Content-Length": upstream.headers.get("content-length")! }
        : {}),
    },
  });
}
