// Download a pin's image, at a chosen size.
//
//   GET /api/pins/<id>/download            → the original file
//   GET /api/pins/<id>/download?size=small → resized to 640px wide
//
// Why a route instead of <a download href={pin.imageUrl}>? Because the
// `download` attribute is IGNORED cross-origin — the browser navigates to the
// image instead of saving it, and the user ends up on someone else's CDN
// looking at a JPEG. Proxying through our own origin and setting
// Content-Disposition: attachment is what actually makes it a download.
//
// PUBLIC, like viewing — and "like viewing" is doing real work now that pins can
// be private: the lookup is viewer-aware, so a private pin is downloadable by
// its author and 404s for everyone else. A route that fetched by id without the
// session would be a way to read a private pin's bytes without its page.

import { cdnImage, isCloudinaryUrl } from "@/lib/cloudinary-url";
import { getPinById } from "@/lib/db/pins";
import {
  EXTENSION_BY_TYPE,
  contentDisposition,
  downloadWidth,
  parseDownloadSize,
  slugifyFilename,
} from "@/lib/download";
import { currentUser } from "@/lib/session";

export async function GET(request: Request, ctx: RouteContext<"/api/pins/[id]/download">) {
  const { id } = await ctx.params;
  const size = parseDownloadSize(new URL(request.url).searchParams.get("size"));

  const user = await currentUser();

  const pin = await getPinById(id, user?.id);
  if (!pin) return Response.json({ error: "No such pin." }, { status: 404 });

  // ── Picking the URL to fetch ──────────────────────────────────────────────
  // For a Cloudinary-hosted pin, the resize is a transformation in the URL:
  // Cloudinary renders it at the edge, caches it, and we stream the result. So
  // "download at 640px" costs us no image processing at all.
  //
  // For a pin that points somewhere else (a pasted link, a Pixabay photo) there
  // is no transformation to inject, so every size falls back to the original.
  // The menu reflects that — see <DownloadMenu resizable> — rather than
  // offering four options that silently deliver the same file.
  const requested = downloadWidth(size);

  // `c_limit` never scales an image UP, so asking for 2048px from an 800px
  // original delivers 800px. Clamping here means the FILENAME says what the
  // file actually is: without it a user gets `sunset-2048.jpg` containing an
  // 800px image, which is a small lie that survives on their disk forever.
  // <DownloadMenu maxWidth> hides the impossible sizes for the same reason.
  const original = pin.width;
  const width = requested && (!original || requested < original) ? requested : null;

  const source =
    width && isCloudinaryUrl(pin.imageUrl)
      ? cdnImage(pin.imageUrl, { width, quality: "auto:best" })
      : pin.imageUrl;

  // We only ever fetch a URL that was validated as http(s) when the pin was
  // created, so this can't be pointed at a file:// or data: target.
  let upstream: Response;
  try {
    upstream = await fetch(source, {
      // Some hosts refuse requests without one.
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
  const suffix = width ? `-${width}` : "";
  const filename = `${slugifyFilename(pin.title)}${suffix}.${extension}`;

  // Streamed straight through — the whole file never sits in our memory.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(filename),
      // `private` because the response depends on the session: a private pin is
      // downloadable by its author and 404s for everyone else, and a shared
      // cache keyed only on the URL would serve one user's answer to another.
      "Cache-Control": "private, max-age=0, must-revalidate",
      ...(upstream.headers.get("content-length")
        ? { "Content-Length": upstream.headers.get("content-length")! }
        : {}),
    },
  });
}
