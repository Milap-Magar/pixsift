// ── Who can see a pin ───────────────────────────────────────────────────────
//
// `public`  — it shows up in the feed, in search, in Discover, for everyone.
// `private` — only its author ever sees it, on their own dashboard/profile and
//             on its own detail page.
//
// This file is deliberately tiny and dependency-free, for the same reason
// lib/upload-limits.ts is: the Add-photo dialog is a Client Component and needs
// these values, and importing them from lib/db/pins.ts would drag the MongoDB
// driver into the browser bundle.
//
// The rule itself is NOT enforced here. It's enforced in the queries — see
// `visibleTo()` in lib/db/pins.ts — because a filter the database applies can't
// be bypassed by calling a different page, an API route, or a Server Action
// directly.

export const VISIBILITIES = [
  {
    value: "public",
    label: "Public",
    hint: "Anyone can see this in the feed.",
  },
  {
    value: "private",
    label: "Private",
    hint: "Only you can see this.",
  },
] as const;

export type Visibility = (typeof VISIBILITIES)[number]["value"];

/** What a pin gets when nobody says otherwise. */
export const DEFAULT_VISIBILITY: Visibility = "public";

/** Narrows anything off the wire — form fields, JSON bodies, query params. */
export function isVisibility(value: unknown): value is Visibility {
  return VISIBILITIES.some((option) => option.value === value);
}

/**
 * Reads a visibility off untrusted input, falling back to the default.
 *
 * Note which way the fallback points: unrecognised input becomes `public`, never
 * `private`. A form that forgets the field should produce the same pin it always
 * did — and anything the user genuinely wants hidden has to say so explicitly.
 */
export function parseVisibility(value: unknown): Visibility {
  return isVisibility(value) ? value : DEFAULT_VISIBILITY;
}
