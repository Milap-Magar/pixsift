// The MongoDB-backed dataset API.
//
//   GET  /api/dashboard                     newest 24 pins
//   GET  /api/dashboard?limit=50&cursor=…   the next page (keyset, see lib/db/pins.ts)
//   GET  /api/dashboard?q=mountain          full-text search over title + description
//   GET  /api/dashboard?author=me@x.com     one author's pins
//   POST /api/dashboard                     store a new link + title + description
//
// GET is public; POST requires a session — the same rule /api/pins enforces, and
// it's enforced HERE rather than in the UI, because a route handler is a public
// endpoint that anything can call.

import { type NextRequest } from "next/server";

import { analyzeInBackground } from "@/lib/algorithms/pipeline";
import { AlreadySavedError, createPin, listPins, searchPins } from "@/lib/db/pins";
import { currentUser } from "@/lib/session";
import { parseVisibility } from "@/lib/visibility";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  const limitParam = Number(params.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  // Signed in, you also see your own private pins — which makes the response
  // viewer-specific, and therefore not something a shared cache may keep. The
  // two branches below are the same query with two different cache headers, and
  // getting that pairing wrong is precisely how a private pin leaks.
  const user = await currentUser();

  const cacheHeaders = user
    ? { "Cache-Control": "private, no-store" }
    : {
        // The public feed changes only when someone adds a pin. A short
        // shared-cache window absorbs bursts, and `stale-while-revalidate` means
        // the refresh happens behind an already-served response.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
      };

  try {
    if (q) {
      const pins = await searchPins(q, { limit, viewerId: user?.id });
      return Response.json({ pins, nextCursor: null }, { headers: cacheHeaders });
    }

    const page = await listPins({
      limit,
      cursor: params.get("cursor"),
      authorId: params.get("author") ?? undefined,
      viewerId: user?.id,
    });

    return Response.json(page, { headers: cacheHeaders });
  } catch (error) {
    console.error("GET /api/dashboard failed:", error);
    return Response.json({ error: "Failed to fetch pins." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "You must be signed in to add a pin." }, { status: 401 });
  }

  // Two ways in: a pasted link, or a search result. A search result carries its
  // provider id and tags — worth keeping, because the id survives URL changes and
  // the tags are what the recommender ranks on.
  let body: {
    title?: string;
    description?: string;
    imageUrl?: string;
    thumbUrl?: string;
    width?: number;
    height?: number;
    provider?: "pixabay";
    providerId?: string;
    providerPageUrl?: string;
    credit?: string;
    tags?: string[];
    visibility?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const title = body.title?.trim();
  const description = body.description?.trim() || undefined;
  const imageUrl = body.imageUrl?.trim();

  if (!title || !imageUrl) {
    return Response.json({ error: "Both 'title' and 'imageUrl' are required." }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(imageUrl)) {
    return Response.json({ error: "'imageUrl' must be an http(s) URL." }, { status: 400 });
  }

  try {
    const pin = await createPin({
      title,
      description,
      imageUrl,
      thumbUrl: body.thumbUrl?.trim(),
      width: body.width,
      height: body.height,
      author: user.name,
      authorId: user.id,
      provider: body.provider === "pixabay" ? "pixabay" : undefined,
      providerId: body.providerId?.trim(),
      providerPageUrl: body.providerPageUrl?.trim(),
      credit: body.credit?.trim(),
      tags: body.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      visibility: parseVisibility(body.visibility),
    });

    // Hash and palette are computed AFTER the response goes out. The bytes are
    // on Pixabay's servers, so analysing inline would put a download and a
    // decode in front of a click whose only job is "add this to my board" —
    // seconds of waiting for a result the response does not carry. See
    // `analyzeInBackground` for why this is `after()` and not a loose promise.
    analyzeInBackground(pin.id, pin.imageUrl);

    return Response.json({ pin }, { status: 201 });
  } catch (error) {
    // 409, not 500: saving twice isn't a server fault, and the UI can just show
    // the pin as already saved.
    if (error instanceof AlreadySavedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    console.error("POST /api/dashboard failed:", error);
    return Response.json({ error: "Failed to save the pin." }, { status: 500 });
  }
}
