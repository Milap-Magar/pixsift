// ── The shared `Pin` shape, and an in-memory store of FAVOURITES ────────────
//
// Pins themselves live in MongoDB — see lib/db/pins.ts, which owns the document
// shape, the indexes and every query. This file used to hold an in-memory array
// of pins as well, and that array was a bug with a plausible disguise: uploads
// were written into it while the feed read from Mongo, so a photo you'd just
// uploaded appeared to save and then simply wasn't anywhere. One store, one
// answer — that's why the array is gone.
//
// What's left:
//   `Pin`         the shape components render. MongoDB's `SavedPin` extends it.
//   `seedImageUrl` where a seed image actually lives (Cloudinary, or a fallback).
//   favourites     userId -> the pin ids they saved.
//
// The favourites map is still in memory, with the usual caveats: it RESETS on
// restart and is NOT shared between server instances. That's fine for learning,
// and it's the next thing worth moving — a `favorites` collection of
// `{ userId, pinId, savedAt }` would also give /most-popular a real "this week"
// window, which it can't have while saves carry no timestamps.

import { DEMO_ACTIVITY_ENABLED, SEED_FAVORITES, type SeedPin } from "./seed-data";
import { SEED_MANIFEST } from "./seed-manifest";
import type { Visibility } from "./visibility";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

export type Pin = {
  id: string;
  title: string;
  description?: string;
  imageUrl: string;
  author: string; // display name of whoever added it
  authorId: string; // stable key (email) — this is what "my pins" filters on
  createdAt: number;

  // Set only for pins uploaded through Cloudinary (as opposed to a pasted URL).
  // publicId is what you'd use to build transformation URLs or delete the asset.
  publicId?: string;
  width?: number;
  height?: number;

  /**
   * Public or private. Optional here and required on `SavedPin`, so a component
   * can render a plain `Pin` (a test fixture, a Pixabay result being previewed)
   * without inventing a visibility for it.
   *
   * Cards use this only to draw the "Private" badge. Whether you're allowed to
   * see the pin at all was decided by the query that loaded it.
   */
  visibility?: Visibility;
};

// ── Seed image URLs ─────────────────────────────────────────────────────────

/**
 * Which seed images are genuinely on Cloudinary right now.
 *
 * Gating on the MANIFEST rather than on `CLOUDINARY_CLOUD_NAME` being set is the
 * whole point: a configured-but-wrong cloud name (or a correct one before
 * `bun run seed` has run) would otherwise point every image at a URL that 404s.
 * We also re-check the cloud name matches, so switching accounts falls back
 * instead of serving another account's asset ids.
 */
const uploadedPublicIds = new Set<string>(
  cloudName && SEED_MANIFEST.cloudName === cloudName ? SEED_MANIFEST.publicIds : [],
);

/** Exported so scripts/seed-mongo.mts stores the exact same link the app renders. */
export const seedImageUrl = (seed: SeedPin): string =>
  uploadedPublicIds.has(seed.publicId)
    ? `https://res.cloudinary.com/${cloudName}/image/upload/${seed.publicId}`
    : seed.fallbackUrl;

// ── Favourites ──────────────────────────────────────────────────────────────
// Each of these takes a userId, because a favourite only exists in the context
// of a signed-in user. Callers must have checked the session first — the server
// actions and the API routes both do.
//
// Only pin IDS are stored. To turn them into pins, hand them to
// `getPinsByIds(ids, viewerId)` in lib/db/pins.ts — which is also what keeps a
// stale favourite (a pin since deleted, or one you saved before its author made
// it private) from showing up: it simply isn't in the result.

// userId (email) -> the set of pin ids that user saved.
const favorites = new Map<string, Set<string>>();

if (DEMO_ACTIVITY_ENABLED) {
  for (const [userId, pinIds] of Object.entries(SEED_FAVORITES)) {
    favorites.set(userId, new Set(pinIds));
  }
}

export function getFavoriteIds(userId: string): Set<string> {
  return favorites.get(userId) ?? new Set<string>();
}

export function isFavorite(userId: string, pinId: string): boolean {
  return getFavoriteIds(userId).has(pinId);
}

/**
 * The whole favourites matrix: userId -> the pins they saved.
 *
 * Collaborative filtering needs to see everyone's saves at once (that's the
 * entire signal), so this is the one function that reads across users. It stays
 * server-side — lib/recommend is only ever imported by Server Components.
 */
export function getAllFavoriteSets(): Map<string, Set<string>> {
  return favorites;
}

/** How many people saved this pin. Used as a popularity signal in ranking. */
export function getFavoriteCount(pinId: string): number {
  let count = 0;
  for (const set of favorites.values()) if (set.has(pinId)) count++;
  return count;
}

/**
 * Forget a pin everywhere it was saved. Called when the pin is deleted.
 *
 * Reads that go through `getPinsByIds` already skip an id with no row behind it,
 * so this isn't what keeps a deleted pin out of the grid. It's for the two
 * places that count ids without resolving them — `getFavoriteCount`, and the
 * collaborative filter, which would otherwise keep recommending an image nobody
 * can open on the strength of saves of something that no longer exists.
 */
export function forgetPin(pinId: string): void {
  for (const set of favorites.values()) set.delete(pinId);
}

/** Saves the pin if it wasn't saved, un-saves it if it was. */
export function toggleFavorite(userId: string, pinId: string): { favorited: boolean } {
  let set = favorites.get(userId);
  if (!set) {
    set = new Set<string>();
    favorites.set(userId, set);
  }

  if (set.has(pinId)) {
    set.delete(pinId);
    return { favorited: false };
  }

  set.add(pinId);
  return { favorited: true };
}
