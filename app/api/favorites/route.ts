// The Favourites API. Unlike /api/pins (where GET is public), BOTH methods here
// are protected — a favourite only ever belongs to one signed-in user, and users
// can only ever read or change their own.
//
// The dashboard UI doesn't need this route (it uses the Server Actions in
// app/actions/pins.ts), but it's the same rules expressed as HTTP for anything
// outside the app.

import { type NextRequest } from "next/server";

import { getPinById, getPinsByIds } from "@/lib/db/pins";
import { getFavoriteIds, toggleFavorite } from "@/lib/pins";
import { currentUser } from "@/lib/session";

const unauthorized = () =>
  Response.json({ error: "You must be signed in to manage favourites." }, { status: 401 });

// GET /api/favorites — the caller's own saved pins.
//
// The favourites store keeps ids; MongoDB turns them into pins. Anything the
// caller may no longer see — deleted, or made private by its author since they
// saved it — simply isn't in the result, because `getPinsByIds` applies the same
// visibility rule as every other read.
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  const pins = await getPinsByIds([...getFavoriteIds(user.id)], user.id);
  return Response.json({ pins }, { headers: { "Cache-Control": "private, no-store" } });
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
  // Someone else's private pin reads as "no such pin" here, exactly as it does
  // everywhere else — otherwise this endpoint would answer "does pin X exist?"
  // for pins the caller can't see.
  if (!(await getPinById(pinId, user.id))) {
    return Response.json({ error: "No such pin." }, { status: 404 });
  }

  const { favorited } = toggleFavorite(user.id, pinId);

  return Response.json({ favorited, favoriteIds: [...getFavoriteIds(user.id)] });
}
