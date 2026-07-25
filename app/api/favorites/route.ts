// The Favourites API. Unlike /api/pins (where GET is public), BOTH methods here
// are protected — a favourite only ever belongs to one signed-in user, and users
// can only ever read or change their own.
//
// The dashboard UI doesn't need this route (it uses the Server Actions in
// app/actions/pins.ts), but it's the same rules expressed as HTTP for anything
// outside the app.

import { type NextRequest } from "next/server";

import { getFavoriteIds, getFavoritePins, getPin, toggleFavorite } from "@/lib/pins";
import { currentUser } from "@/lib/session";

const unauthorized = () =>
  Response.json({ error: "You must be signed in to manage favourites." }, { status: 401 });

// GET /api/favorites — the caller's own saved pins.
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  return Response.json({ pins: getFavoritePins(user.id) });
}

// POST /api/favorites — toggle one pin. Body: { "pinId": "..." }
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();

  let body: { pinId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const pinId = body.pinId?.trim();
  if (!pinId) return Response.json({ error: "'pinId' is required." }, { status: 400 });
  if (!getPin(pinId)) return Response.json({ error: "No such pin." }, { status: 404 });

  const { favorited } = toggleFavorite(user.id, pinId);

  return Response.json({ favorited, favoriteIds: [...getFavoriteIds(user.id)] });
}
