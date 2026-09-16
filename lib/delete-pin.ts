// ── Deleting a pin, in one place ────────────────────────────────────────────
//
// Two callers need this: the Server Action behind the Delete button
// (app/actions/pins.ts) and `DELETE /api/pins/[id]`. A pin is spread across
// four stores, so "delete" is four steps — and two copies of a four-step
// teardown drift, leaving one route that tidies up and one that leaves litter.
//
// Ownership is NOT checked here. It's checked where it can't be skipped: inside
// `deletePin`'s own filter, which only matches a row whose `authorId` is the one
// the caller passed. There is no argument to this function that can weaken that.

import { destroyImage, isCloudinaryConfigured } from "@/lib/cloudinary";
import { removeComments } from "@/lib/comments";
import { deletePin } from "@/lib/db/pins";
import { forgetPin } from "@/lib/pins";

export type RemovedPin = {
  id: string;
  title: string;
  /**
   * Whether a Cloudinary asset was destroyed too. `false` is a normal outcome,
   * not a failure: a linked or seeded pin has no file of ours to remove.
   */
  fileRemoved: boolean;
  commentsRemoved: number;
};

/**
 * Remove a pin and everything hanging off it. Returns `null` when there is no
 * such pin owned by `authorId` — the caller turns that into its own vocabulary
 * (a 404, or an error string for the dialog).
 *
 * The order matters. The row goes first, then the in-memory stores, then the
 * image file — least to most irreversible, so a failure part-way through leaves
 * an invisible orphan rather than a visible pin whose image 404s.
 */
export async function removePin(id: string, authorId: string): Promise<RemovedPin | null> {
  // Ownership lives in this filter. What comes back is the pin as it was a
  // moment ago, which is the only place its `publicId` still exists.
  const deleted = await deletePin(id, authorId);
  if (!deleted) return null;

  // Both stores are in memory and keyed by pin id (lib/comments.ts,
  // lib/pins.ts). Neither can fail, so neither is wrapped.
  const commentsRemoved = removeComments(id);
  forgetPin(id);

  // Only for pins we uploaded ourselves. A `link` pin's image is on somebody
  // else's host, and a `seed` pin shares its asset with the seeded dataset —
  // destroying that would pull the image out of every install seeded from the
  // same Cloudinary account, to undo one row.
  let fileRemoved = false;
  const ourAsset = deleted.source === "upload" ? deleted.publicId : undefined;

  if (ourAsset && isCloudinaryConfigured()) {
    try {
      fileRemoved = await destroyImage(ourAsset);
    } catch (error) {
      // The pin itself is already gone, so the delete did what was asked. Log
      // the orphan rather than reporting a failure the user can't act on and a
      // retry can't fix — the row will never come back to be deleted again.
      console.error(`removePin(${id}): the pin is gone but its image isn't:`, error);
    }
  }

  return { id: deleted.id, title: deleted.title, fileRemoved, commentsRemoved };
}
