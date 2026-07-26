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
  cloudName: "h8wtkcqh",
  publicIds: [
      "pixsift/seed/misty-mountains",
      "pixsift/seed/city-at-night",
      "pixsift/seed/forest-path",
      "pixsift/seed/ocean-waves",
      "pixsift/seed/desert-dunes",
      "pixsift/seed/autumn-leaves",
      "pixsift/seed/snowy-cabin",
      "pixsift/seed/wildflowers",
      "pixsift/seed/fog-over-the-lake",
      "pixsift/seed/ridge-line-at-dusk",
      "pixsift/seed/rain-on-glass",
      "pixsift/seed/old-stone-bridge",
      "pixsift/seed/first-snow",
      "pixsift/seed/harbour-lights"
  ],
  seededAt: "2026-07-26T01:34:10.307Z",
};
