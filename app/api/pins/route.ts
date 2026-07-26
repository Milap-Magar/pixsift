// The Pins API — this is where "viewing is public, adding requires login" is
// actually enforced. UI restrictions alone are never enough; the API itself
// must check auth (the Next docs stress this — treat Route Handlers like any
// public endpoint).
//
// It reads and writes the SAME MongoDB collection the rest of the app uses
// (lib/db/pins.ts). It used to talk to an in-memory array instead, which meant
// this endpoint and the home feed disagreed about what existed.

import { type NextRequest } from "next/server";

import { createPin, listPins } from "@/lib/db/pins";
import { currentUser } from "@/lib/session";
import { parseVisibility } from "@/lib/visibility";

// GET /api/pins  — PUBLIC. Anyone can list pins.
//
// PUBLIC PINS ONLY, and not because we forgot the session: this response is
// cacheable, and a cache key that doesn't include the viewer would hand one
// user's private pins to the next caller. Signed-in views of your own private
// pins live on /dashboard and /profile, which are rendered per request.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limitParam = Number(params.get("limit"));

  try {
    const page = await listPins({
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
      cursor: params.get("cursor"),
      authorId: params.get("author") ?? undefined,
    });

    return Response.json(page);
  } catch (error) {
    console.error("GET /api/pins failed:", error);
    return Response.json({ error: "Failed to fetch pins." }, { status: 500 });
  }
}

// POST /api/pins — PROTECTED. Must be logged in to add a pin.
export async function POST(request: NextRequest) {
  // 1. Who is calling? `currentUser()` reads the session from the request cookie.
  const user = await currentUser();
  if (!user) {
    // 401 = "you're not authenticated". The frontend uses this to send the
    // user to /login.
    return Response.json({ error: "You must be signed in to add a pin." }, { status: 401 });
  }

  // 2. Validate the body.
  let body: { title?: string; description?: string; imageUrl?: string; visibility?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const title = body.title?.trim();
  const imageUrl = body.imageUrl?.trim();
  if (!title || !imageUrl) {
    return Response.json({ error: "Both 'title' and 'imageUrl' are required." }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(imageUrl)) {
    // Anything else — `javascript:`, `data:` — would end up in an <img src> we
    // render for every visitor.
    return Response.json({ error: "'imageUrl' must be an http(s) URL." }, { status: 400 });
  }

  // 3. Create it, stamping the logged-in user as the author. Note what comes from
  //    where: the client says what the pin IS, the session says whose it is.
  try {
    const pin = await createPin({
      title,
      description: body.description?.trim() || undefined,
      imageUrl,
      author: user.name,
      authorId: user.id,
      visibility: parseVisibility(body.visibility),
      source: "link",
    });

    return Response.json({ pin }, { status: 201 });
  } catch (error) {
    console.error("POST /api/pins failed:", error);
    return Response.json({ error: "Failed to save the pin." }, { status: 500 });
  }
}
