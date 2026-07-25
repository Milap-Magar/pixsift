// ── A tiny in-memory "database" of pins + favourites ────────────────────────
// This lives in server memory. It's perfect for learning, but note:
//   - It RESETS every time the dev server restarts.
//   - It is NOT shared across multiple server instances (e.g. in production).
// The natural next step is to swap these functions for real MongoDB queries
// (you already have a connection string in .env) — the rest of the app won't
// need to change, because everything goes through these helpers.

import {
  DEMO_ACTIVITY_ENABLED,
  SEED_AUTHOR,
  SEED_FAVORITES,
  SEED_PINS,
  daysAgo,
  type SeedPin,
} from "./seed-data";
import { SEED_MANIFEST } from "./seed-manifest";

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
};

// ── Seeding ─────────────────────────────────────────────────────────────────
// The starter gallery and its demo activity live in lib/seed-data.ts. See that
// file for how to re-attribute or switch it off.

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

const seedImageUrl = (seed: SeedPin): string =>
  uploadedPublicIds.has(seed.publicId)
    ? `https://res.cloudinary.com/${cloudName}/image/upload/${seed.publicId}`
    : seed.fallbackUrl;

const pins: Pin[] = SEED_PINS.map((seed) => {
  const onCloudinary = uploadedPublicIds.has(seed.publicId);

  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    imageUrl: seedImageUrl(seed),
    author: SEED_AUTHOR.name,
    authorId: SEED_AUTHOR.id,
    createdAt: daysAgo(seed.daysAgo),
    publicId: onCloudinary ? seed.publicId : undefined,
    width: seed.width,
    height: seed.height,
  };
});

// userId (email) -> the set of pin ids that user saved.
const favorites = new Map<string, Set<string>>();

if (DEMO_ACTIVITY_ENABLED) {
  for (const [userId, pinIds] of Object.entries(SEED_FAVORITES)) {
    favorites.set(userId, new Set(pinIds));
  }
}

// Newest first.
export function getPins(): Pin[] {
  return [...pins].sort((a, b) => b.createdAt - a.createdAt);
}

export function getPin(id: string): Pin | undefined {
  return pins.find((p) => p.id === id);
}

export function getPinsByAuthor(authorId: string): Pin[] {
  return getPins().filter((p) => p.authorId === authorId);
}

export function addPin(input: {
  title: string;
  description?: string;
  imageUrl: string;
  author: string;
  authorId: string;
  publicId?: string;
  width?: number;
  height?: number;
}): Pin {
  const pin: Pin = {
    id: String(pins.length + 1) + "-" + Math.round(Math.random() * 1e6),
    title: input.title,
    description: input.description,
    imageUrl: input.imageUrl,
    author: input.author,
    authorId: input.authorId,
    publicId: input.publicId,
    width: input.width,
    height: input.height,
    createdAt: Date.now(),
  };
  pins.push(pin);
  return pin;
}

// ── Favourites ──────────────────────────────────────────────────────────────
// Each of these takes a userId, because a favourite only exists in the context
// of a signed-in user. Callers must have checked the session first — the server
// actions and the API route both do.

export function getFavoriteIds(userId: string): Set<string> {
  return favorites.get(userId) ?? new Set<string>();
}

export function isFavorite(userId: string, pinId: string): boolean {
  return getFavoriteIds(userId).has(pinId);
}

export function getFavoritePins(userId: string): Pin[] {
  const ids = getFavoriteIds(userId);
  return getPins().filter((p) => ids.has(p.id));
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
