// The comments API. The UI uses the Server Action + SSE stream instead, but the
// same rules expressed as plain HTTP: reading is public, writing needs an account.

import { type NextRequest } from "next/server";

import { addComment, getComments, MAX_COMMENT_LENGTH } from "@/lib/comments";
import { getPin } from "@/lib/pins";
import { currentUser } from "@/lib/session";

// GET /api/pins/:id/comments — PUBLIC.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/pins/[id]/comments">) {
  const { id } = await ctx.params;
  if (!getPin(id)) return Response.json({ error: "No such pin." }, { status: 404 });

  return Response.json({ comments: getComments(id) });
}

// POST /api/pins/:id/comments — PROTECTED. Body: { "body": "..." }
export async function POST(request: NextRequest, ctx: RouteContext<"/api/pins/[id]/comments">) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "You must be signed in to comment." }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!getPin(id)) return Response.json({ error: "No such pin." }, { status: 404 });

  let payload: { body?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const body = payload.body?.trim();
  if (!body) return Response.json({ error: "'body' is required." }, { status: 400 });
  if (body.length > MAX_COMMENT_LENGTH) {
    return Response.json(
      { error: `Comments are capped at ${MAX_COMMENT_LENGTH} characters.` },
      { status: 400 },
    );
  }

  // This also pushes the comment to every open SSE stream for the pin.
  const comment = addComment({
    pinId: id,
    body,
    author: user.name,
    authorId: user.id,
    authorImage: user.image,
  });

  return Response.json({ comment }, { status: 201 });
}
