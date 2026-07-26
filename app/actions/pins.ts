"use server";

// Pin Server Actions. Every one of these re-checks the session, because server
// functions are reachable by direct POST — not just through our UI. Hiding a
// button is a UX affordance, never a security control.
//
// These write to MongoDB (lib/db/pins.ts), which is also where every list in the
// app reads from. That sounds too obvious to state, but it's the fix for the bug
// this file used to have: it wrote uploads into the in-memory array in
// lib/pins.ts while the feed read from Mongo, so an upload succeeded — Cloudinary
// even had the file — and then appeared nowhere, and vanished entirely on the
// next server restart.

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/session";
import { createPin, getPinById, updatePinVisibility } from "@/lib/db/pins";
import { toggleFavorite } from "@/lib/pins";
import { parseVisibility, type Visibility } from "@/lib/visibility";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  isCloudinaryConfigured,
  missingCloudinaryEnv,
  uploadImage,
} from "@/lib/cloudinary";

export type CreatePinState = {
  error?: string;
  createdId?: string;
};

/**
 * Every surface that lists pins. Called after any write, so the new pin is
 * already in the grid behind the dialog by the time it closes.
 *
 * `revalidatePath` in a Server Action also re-renders the current route and ships
 * the new RSC payload in the same response — one roundtrip, no follow-up fetch.
 */
function revalidatePinSurfaces() {
  for (const path of ["/", "/dashboard", "/profile", "/discover", "/most-popular"]) {
    revalidatePath(path);
  }
}

/**
 * Creates a pin from EITHER a dropped/selected file (uploaded to Cloudinary) or
 * a pasted image URL. The dialog sends whichever the user provided.
 *
 * Used with `useActionState`, hence the (prevState, formData) signature.
 * Returns an error string instead of throwing so the dialog can show it inline.
 */
export async function createPinAction(
  _prevState: CreatePinState,
  formData: FormData,
): Promise<CreatePinState> {
  const user = await currentUser();
  if (!user) return { error: "You must be signed in to add a pin." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const file = formData.get("file");

  // Unrecognised → public, which is what a pin got before this field existed.
  const visibility = parseVisibility(formData.get("visibility"));

  if (!title) return { error: "Give it a title." };
  if (title.length > 120) return { error: "Keep the title under 120 characters." };
  if (description.length > 500) return { error: "Keep the description under 500 characters." };

  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !imageUrl) return { error: "Drop an image, or paste an image URL." };

  const common = {
    title,
    description: description || undefined,
    author: user.name,
    authorId: user.id,
    visibility,
  };

  // ── Path 1: an actual file — upload it to Cloudinary ──────────────────────
  if (hasFile) {
    if (!isCloudinaryConfigured()) {
      return {
        error: `Uploads need ${missingCloudinaryEnv().join(" and ")} in .env. You can paste an image URL instead for now.`,
      };
    }

    // Both checks matter: `type` is client-supplied and easily spoofed, but it
    // catches honest mistakes, while `size` protects the server either way.
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      return { error: "That file isn't a supported image (JPEG, PNG, WebP, GIF or AVIF)." };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { error: `That image is too big — the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` };
    }

    let uploaded;
    try {
      uploaded = await uploadImage(file, { tags: [`user:${user.id}`] });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "The upload failed. Try again.",
      };
    }

    // The image is on Cloudinary now. If this write fails we'd have an orphaned
    // asset and no pin, so say what actually happened rather than "upload
    // failed" — the upload is the one part that worked.
    let created;
    try {
      created = await createPin({
        ...common,
        imageUrl: uploaded.url,
        publicId: uploaded.publicId,
        width: uploaded.width,
        height: uploaded.height,
        source: "upload",
      });
    } catch (error) {
      console.error("createPinAction: upload succeeded but the pin write failed:", error);
      return { error: "The image uploaded, but saving the pin failed. Try again." };
    }

    revalidatePinSurfaces();
    return { createdId: created.id };
  }

  // ── Path 2: a pasted URL ──────────────────────────────────────────────────
  // Only allow real http(s) URLs — blocks javascript: and data: getting into an
  // <img src>, which we render for every visitor.
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return { error: "That image URL isn't valid." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Image URL must start with http:// or https://" };
  }

  let created;
  try {
    created = await createPin({ ...common, imageUrl: parsed.toString(), source: "link" });
  } catch (error) {
    console.error("createPinAction: pin write failed:", error);
    return { error: "Couldn't save that pin. Try again." };
  }

  revalidatePinSurfaces();
  return { createdId: created.id };
}

export type ToggleFavoriteResult = {
  favorited?: boolean;
  error?: string;
};

/** Save / un-save a pin. Signed-in users only. */
export async function toggleFavoriteAction(pinId: string): Promise<ToggleFavoriteResult> {
  const user = await currentUser();
  if (!user) return { error: "You must be signed in to save a pin." };

  // Passing the viewer means you can favourite your own private pin, but not
  // somebody else's — for them it reads as "no such pin", which is the answer a
  // private pin gives to everyone who isn't its author.
  if (!(await getPinById(pinId, user.id))) return { error: "That pin no longer exists." };

  const { favorited } = toggleFavorite(user.id, pinId);

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/profile");

  return { favorited };
}

export type SetVisibilityResult = {
  visibility?: Visibility;
  error?: string;
};

/**
 * Make a pin public or private. Only its author can, and that's enforced by the
 * update's own filter (`{ _id, authorId }`) rather than by a check up here — see
 * `updatePinVisibility`.
 *
 * Takes the id and the desired state, nothing else. The client says WHICH pin and
 * WHAT change; who owns it comes from the session.
 */
export async function setPinVisibilityAction(
  pinId: string,
  visibility: Visibility,
): Promise<SetVisibilityResult> {
  const user = await currentUser();
  if (!user) return { error: "You must be signed in to change this." };

  const updated = await updatePinVisibility(pinId, user.id, parseVisibility(visibility));
  if (!updated) return { error: "That's not your pin." };

  revalidatePinSurfaces();
  revalidatePath(`/pin/${pinId}`);

  return { visibility: updated.visibility };
}
