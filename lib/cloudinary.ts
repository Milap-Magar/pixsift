// ── Cloudinary uploads ──────────────────────────────────────────────────────
// Everything here is server-only: the API secret must never reach the browser,
// so uploads go through a Server Action rather than straight from the client.
//
// REQUIRED ENVIRONMENT (.env):
//   CLOUDINARY_CLOUD_NAME   your cloud name (from the Cloudinary dashboard)
//   CLOUDINARY_API_KEY      the API key
//   CLOUDINARY_SECRET       the API secret  ← this one you already have
//
// OPTIONAL:
//   CLOUDINARY_FOLDER       which folder ("dataset") to upload into. Defaults
//                           to "pixsift". Everything also gets tagged so you
//                           can select the set later with a tag search.
//
// Until the cloud name and API key are set, `isCloudinaryConfigured()` returns
// false and the UI quietly falls back to "paste an image URL" instead of
// breaking. Nothing here throws at import time.

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

// Re-exported so server code has one import for "the upload rules". The values
// themselves live in a client-safe module — see lib/upload-limits.ts.
export { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "./upload-limits";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_SECRET ?? process.env.CLOUDINARY_API_SECRET;

/** The Cloudinary folder new pins land in. */
export const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER ?? "pixsift";

/** Every upload carries this tag, so the whole set is easy to query later. */
export const CLOUDINARY_TAG = "pixsift-pin";

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

/** Human-readable list of what's still missing — used in the upload error. */
export function missingCloudinaryEnv(): string[] {
  const missing: string[] = [];
  if (!CLOUD_NAME) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!API_KEY) missing.push("CLOUDINARY_API_KEY");
  if (!API_SECRET) missing.push("CLOUDINARY_SECRET");
  return missing;
}

let configured = false;

function ensureConfigured() {
  if (configured) return;
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
  configured = true;
}

export type UploadedImage = {
  url: string;
  publicId: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
};

/**
 * Uploads one image and returns just the fields a Pin needs.
 *
 * The SDK's buffer path is `upload_stream`, which is callback-based, so it gets
 * wrapped in a promise here.
 */
export async function uploadImage(
  file: File,
  options: { folder?: string; tags?: string[] } = {},
): Promise<UploadedImage> {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      `Cloudinary isn't configured. Add ${missingCloudinaryEnv().join(", ")} to .env.`,
    );
  }

  ensureConfigured();

  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder ?? CLOUDINARY_FOLDER,
        tags: [CLOUDINARY_TAG, ...(options.tags ?? [])],
        resource_type: "image",
        // Strip metadata and let Cloudinary pick the best format/quality per
        // browser — the delivered file is much smaller than the original.
        transformation: [{ fetch_format: "auto", quality: "auto" }],
      },
      (error, uploaded) => {
        if (error) return reject(new Error(error.message));
        if (!uploaded) return reject(new Error("Cloudinary returned no result."));
        resolve(uploaded);
      },
    );

    stream.end(buffer);
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
  };
}

/**
 * Deletes one uploaded asset, by the `publicId` we stored on the pin.
 *
 * Returns whether Cloudinary actually removed something. `not found` is NOT an
 * error here: an asset deleted in the Cloudinary console, or a retried request
 * whose first attempt got through, should both leave the caller able to finish
 * its own cleanup rather than fail on work that is already done.
 *
 * Only ever call this with a `publicId` read back off a pin the caller has just
 * proved it owns. A public id taken from the request would let anyone name any
 * asset in the account and have us delete it.
 */
export async function destroyImage(publicId: string): Promise<boolean> {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      `Cloudinary isn't configured. Add ${missingCloudinaryEnv().join(", ")} to .env.`,
    );
  }

  ensureConfigured();

  // `invalidate` clears the CDN copies too. Without it the file stays reachable
  // at its delivery URL — cached at the edge — for as long as the cache holds
  // it, which is not what "delete" means to the person who asked for it.
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });

  if (result.result === "ok") return true;
  if (result.result === "not found") return false;

  throw new Error(`Cloudinary refused to delete ${publicId}: ${result.result}`);
}
