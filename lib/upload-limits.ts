// Upload rules shared by the browser and the server.
//
// These live apart from lib/cloudinary.ts on purpose: the dropzone needs them
// for instant feedback, and importing them from the Cloudinary module would
// drag the whole Node SDK (and the API secret's neighbourhood) into the client
// bundle. The server re-checks every one of these anyway — the client copy is
// only there so you find out before waiting on an upload.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** The `accept` attribute for <input type="file">. */
export const IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");

export function isAcceptedImageType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
