// GENERATED FILE — rewritten by `bun run seed`. Don't edit by hand.
//
// Records which seed images have actually been uploaded, and to which cloud.
//
// Why this exists: lib/pins.ts used to switch the gallery over to Cloudinary
// URLs the moment CLOUDINARY_CLOUD_NAME was set. If that value was wrong — or
// right but `bun run seed` hadn't run yet — every image on the site 404'd.
// Presence of a config value is not evidence the assets exist. This file is.

export const SEED_MANIFEST: {
  /** The cloud the ids below live in. Null until the first successful seed. */
  cloudName: string | null;
  /** Cloudinary public ids confirmed uploaded. */
  publicIds: string[];
  /** ISO timestamp of the last successful seed, for your own reference. */
  seededAt: string | null;
} = {
  cloudName: null,
  publicIds: [],
  seededAt: null,
};
