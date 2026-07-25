// The Pins API — this is where "viewing is public, adding requires login" is
// actually enforced. UI restrictions alone are never enough; the API itself
// must check auth (the Next docs stress this — treat Route Handlers like any
// public endpoint).

import { type NextRequest } from "next/server";
import { getPins, addPin } from "@/lib/pins";
import { currentUser } from "@/lib/session";

// GET /api/pins  — PUBLIC. Anyone can list pins.
export async function GET() {
  return Response.json({ pins: getPins() });
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
  let body: { title?: string; imageUrl?: string };
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

  // 3. Create it, stamping the logged-in user as the author.
  const pin = addPin({
    title,
    imageUrl,
    author: user.name,
    authorId: user.id,
  });

  return Response.json({ pin }, { status: 201 });
}
