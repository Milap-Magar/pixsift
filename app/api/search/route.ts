// GET /api/search?q=mountain&page=1 — image search, served from Pixabay.
//
// This route exists so the API key stays on the server. The browser calls us, we
// call Pixabay. Nothing here is stored: search results are borrowed, and only the
// ones a user saves are written to MongoDB (POST /api/dashboard).
//
// Public, like the gallery itself — you shouldn't need an account to look around.

import { type NextRequest } from "next/server";

import { PixabayError, isPixabayConfigured, searchImages } from "@/lib/pixabay";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim();

  if (!q) {
    return Response.json({ error: "A 'q' search term is required." }, { status: 400 });
  }
  if (!isPixabayConfigured()) {
    return Response.json(
      { error: "Image search isn't configured. Add PIXABAY_API_KEY to .env." },
      { status: 503 },
    );
  }

  const page = Number(params.get("page")) || 1;
  const perPage = Number(params.get("per_page")) || 24;

  try {
    const { images, totalHits } = await searchImages({ query: q, page, perPage });

    return Response.json(
      { images, totalHits, page },
      {
        headers: {
          // Mirrors Pixabay's own 24h caching rule at our edge, so repeat
          // searches don't even reach this handler.
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    if (error instanceof PixabayError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("GET /api/search failed:", error);
    return Response.json({ error: "Search failed." }, { status: 500 });
  }
}
