"use server";

// Pin Server Actions. Every one of these re-checks the session, because server
// functions are reachable by direct POST — not just through our UI. Hiding a
// button is a UX affordance, never a security control.

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/session";
import { addPin, getPin, toggleFavorite } from "@/lib/pins";
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

    const pin = addPin({
      ...common,
      imageUrl: uploaded.url,
      publicId: uploaded.publicId,
      width: uploaded.width,
      height: uploaded.height,
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    return { createdId: pin.id };
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

  const pin = addPin({ ...common, imageUrl: parsed.toString() });

  // Refresh every surface that lists pins.
  revalidatePath("/");
  revalidatePath("/dashboard");

  return { createdId: pin.id };
}

export type ToggleFavoriteResult = {
  favorited?: boolean;
  error?: string;
};

/** Save / un-save a pin. Signed-in users only. */
export async function toggleFavoriteAction(pinId: string): Promise<ToggleFavoriteResult> {
  const user = await currentUser();
  if (!user) return { error: "You must be signed in to save a pin." };

  if (!getPin(pinId)) return { error: "That pin no longer exists." };

  const { favorited } = toggleFavorite(user.id, pinId);

  revalidatePath("/");
  revalidatePath("/dashboard");

  return { favorited };
}
