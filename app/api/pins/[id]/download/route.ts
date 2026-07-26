// Download a pin's image.
//
// Why a route instead of <a download href={pin.imageUrl}>? Because the `download`
// attribute is ignored cross-origin — the browser just navigates to the image
// instead of saving it. Proxying through our own origin and setting
// Content-Disposition: attachment is what actually makes it a download.
//
// PUBLIC, like viewing — and that "like viewing" is doing real work now that pins
// can be private: the lookup is viewer-aware, so a private pin is downloadable by
// its author and 404s for everyone else. A route that fetched by id without the
// session would be a way to read a private pin's bytes without its page.

import { getPinById } from "@/lib/db/pins";
import { currentUser } from "@/lib/session";

/** "Misty mountains" -> "misty-mountains" */
function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "pixsift-pin"
  );
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function GET(_request: Request, ctx: RouteContext<"/api/pins/[id]/download">) {
  const { id } = await ctx.params;

  const user = await currentUser();

  const pin = await getPinById(id, user?.id);
  if (!pin) return Response.json({ error: "No such pin." }, { status: 404 });

  // We only ever fetch a URL that was validated as http(s) when the pin was
  // created, so this can't be pointed at a file:// or data: target.
  let upstream: Response;
  try {
    upstream = await fetch(pin.imageUrl, {
      // Some hosts refuse requests without one.
      headers: { "User-Agent": "PixSift" },
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the image." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: `The image host returned ${upstream.status}.` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return Response.json({ error: "That URL isn't an image." }, { status: 415 });
  }

  const extension = EXTENSION_BY_TYPE[contentType.split(";")[0]] ?? "jpg";
  const filename = `${slugify(pin.title)}.${extension}`;

  // Streamed straight through — the whole file never sits in our memory.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      ...(upstream.headers.get("content-length")
        ? { "Content-Length": upstream.headers.get("content-length")! }
        : {}),
    },
  });
}
