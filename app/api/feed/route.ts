// GET /api/feed?cursor=…&limit=30 — one page of the endless home feed.
//
// Public, like the gallery. The cursor is opaque on purpose: it might be pointing
// into MongoDB or into Pixabay, and the caller shouldn't have to know which. See
// lib/feed.ts.

import { type NextRequest } from "next/server";

import { getFeedPage } from "@/lib/feed";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limitParam = Number(params.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 30;

  try {
    const page = await getFeedPage(params.get("cursor"), limit);

    return Response.json(page, {
      headers: {
        // Short window: the database half changes whenever anyone saves a pin.
        // The Pixabay half is separately cached for 24h inside lib/pixabay.ts.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("GET /api/feed failed:", error);
    return Response.json({ error: "Failed to load the feed." }, { status: 500 });
  }
}
