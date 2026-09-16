// One pin, by id.
//
//   DELETE /api/pins/<id>   → remove a pin you uploaded, and its image file
//
// Deleting is the one write where "hiding the button" is most obviously not
// enough: the id is in every URL, so the check that matters is the one made
// here, against the session — never against anything in the request.
//
// The teardown itself is `removePin` in lib/delete-pin.ts, shared with the
// Delete button's Server Action. This file is the HTTP vocabulary around it:
// who may call it, and what each outcome looks like as a status code.

import { type NextRequest } from "next/server";

import { getPinById } from "@/lib/db/pins";
import { removePin } from "@/lib/delete-pin";
import { revalidatePinSurfaces } from "@/lib/revalidate";
import { currentUser } from "@/lib/session";

// DELETE /api/pins/:id — PROTECTED, and author-only.
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/pins/[id]">) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "You must be signed in to delete a pin." }, { status: 401 });
  }

  const { id } = await ctx.params;

  const removed = await removePin(id, user.id);

  if (!removed) {
    // Nothing was deleted, and there are two reasons why. Telling them apart
    // costs one read and only happens on the failure path.
    //
    // The lookup is viewer-aware, so it can only ever report the existence of a
    // pin this caller is already allowed to see: somebody else's PUBLIC pin
    // gets an honest 403, while a private one they can't see is a 404 — the
    // same answer it gives everywhere else in the app.
    const visible = await getPinById(id, user.id);

    return visible
      ? Response.json({ error: "That's not your pin." }, { status: 403 })
      : Response.json({ error: "No such pin." }, { status: 404 });
  }

  revalidatePinSurfaces(id);

  return Response.json({
    deleted: { id: removed.id, title: removed.title },
    // Reported rather than assumed: `false` means the row is gone and the file
    // is not (a link pin, a seed pin, Cloudinary unconfigured, or the destroy
    // failed). The caller shouldn't have to guess which from a bare 200.
    fileRemoved: removed.fileRemoved,
    commentsRemoved: removed.commentsRemoved,
  });
}
