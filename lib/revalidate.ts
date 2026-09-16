// ── Which cached pages a pin write invalidates ──────────────────────────────
//
// Every surface that lists pins, in one place. It lives here rather than in
// app/actions/pins.ts because the API routes need the same list, and a "use
// server" file can only export async functions — so there was nowhere in it to
// put a shared constant.
//
// Keeping one list matters more than it looks: the failure mode of two copies is
// a page that still shows a pin somebody deleted, which reads as "the delete
// didn't work" and gets deleted again.

import { revalidatePath } from "next/cache";

/** Routes whose rendered output depends on the set of pins. */
export const PIN_SURFACES = ["/", "/dashboard", "/profile", "/discover", "/most-popular"] as const;

/**
 * Re-render every pin listing, and optionally one pin's detail page.
 *
 * `revalidatePath` in a Server Action also re-renders the current route and
 * ships the new RSC payload in the same response — one roundtrip, no follow-up
 * fetch. From a Route Handler there's no page to re-render, so it just marks the
 * cache stale for the next request.
 */
export function revalidatePinSurfaces(pinId?: string): void {
  for (const path of PIN_SURFACES) revalidatePath(path);
  if (pinId) revalidatePath(`/pin/${pinId}`);
}
