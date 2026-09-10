// ── Download sizes ──────────────────────────────────────────────────────────
//
// Shared by the download routes and the menu component, so the browser and the
// server cannot disagree about what "medium" means. Client-safe: pure data and
// string manipulation, no SDK and no credentials.

/** Sizes offered in the download menu. `null` width means "whatever the original is". */
export const DOWNLOAD_SIZES = [
  { key: "small", label: "Small", width: 640, hint: "for sharing" },
  { key: "medium", label: "Medium", width: 1280, hint: "for screens" },
  { key: "large", label: "Large", width: 2048, hint: "for print" },
  { key: "original", label: "Original", width: null, hint: "full resolution" },
] as const;

export type DownloadSizeKey = (typeof DOWNLOAD_SIZES)[number]["key"];

export function parseDownloadSize(value: unknown): DownloadSizeKey {
  const match = DOWNLOAD_SIZES.find((size) => size.key === value);
  return match ? match.key : "original";
}

export function downloadWidth(key: DownloadSizeKey): number | null {
  return DOWNLOAD_SIZES.find((size) => size.key === key)?.width ?? null;
}

/** "Misty mountains" -> "misty-mountains" */
export function slugifyFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "pixsift-image"
  );
}

export const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/**
 * Build the `Content-Disposition` value for a download.
 *
 * Both forms are emitted deliberately. The bare `filename=` is ASCII-only and
 * is what older browsers read; `filename*=UTF-8''…` (RFC 5987) carries the real
 * name including any non-ASCII characters. A title like "Café at dusk" would
 * otherwise arrive as a mangled name or, worse, let a quote character in a
 * title break out of the quoted string and inject a header parameter — which is
 * why the ASCII form strips rather than escapes.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "image";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
