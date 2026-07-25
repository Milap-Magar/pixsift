// ── Demo seed data ──────────────────────────────────────────────────────────
//
// This is what makes a freshly-started PixSift look like a place people already
// use, rather than an empty grid. It is DEMO DATA, clearly labelled as such, and
// it is trivial to switch off:
//
//   SEED_DEMO_ACTIVITY=false     # keep the gallery, drop the fake saves/comments
//   SEED_AUTHOR_ID=you@gmail.com # attribute the gallery to your real account,
//                                # so it shows up under "My pins"
//
// The activity isn't only cosmetic — the collaborative-filtering recommender has
// nothing to work with until pins share savers, so this is also what lets
// docs/ALGORITHMS.md's second algorithm actually do something on first run.
//
// IMAGES: each entry carries both a Cloudinary `publicId` and a `fallbackUrl`.
// Run `bun run seed` to upload the gallery to your Cloudinary account; until
// then (or if Cloudinary is unreachable) the picsum fallback is used and
// everything still works. See lib/pins.ts for where that choice is made.

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export const SEEDED_AT = Date.now();

export const daysAgo = (days: number) => SEEDED_AT - days * DAY;
export const minutesAgo = (minutes: number) => SEEDED_AT - minutes * MINUTE;

/** Who the starter gallery belongs to. */
export const SEED_AUTHOR = {
  name: "Milap Magar",
  id: process.env.SEED_AUTHOR_ID ?? "milap@pixsift.app",
};

/** Folder + tag used by scripts/seed-cloudinary.ts. */
export const SEED_FOLDER = "pixsift/seed";
export const SEED_TAG = "pixsift-seed";

export const DEMO_ACTIVITY_ENABLED = process.env.SEED_DEMO_ACTIVITY !== "false";

export type SeedPin = {
  id: string;
  title: string;
  description: string;
  /** Cloudinary public id, once `bun run seed` has uploaded it. */
  publicId: string;
  /** Used until the upload exists. Also the source the seed script uploads FROM. */
  fallbackUrl: string;
  width: number;
  height: number;
  daysAgo: number;
};

// Descriptions deliberately share vocabulary ("mountain", "forest", "trail",
// "snow", "light") — content-based filtering has nothing to rank on if every
// pin is two unrelated words.
export const SEED_PINS: SeedPin[] = [
  { id: "1", title: "Misty mountains", description: "Morning fog rolling through an alpine mountain valley at first light.", publicId: `${SEED_FOLDER}/misty-mountains`, fallbackUrl: "https://picsum.photos/seed/mountain/800/1120", width: 800, height: 1120, daysAgo: 38 },
  { id: "2", title: "City at night", description: "Neon light reflecting on wet streets after the evening rain.", publicId: `${SEED_FOLDER}/city-at-night`, fallbackUrl: "https://picsum.photos/seed/city/800/800", width: 800, height: 800, daysAgo: 31 },
  { id: "3", title: "Forest path", description: "A quiet trail winding deep into dense pine forest.", publicId: `${SEED_FOLDER}/forest-path`, fallbackUrl: "https://picsum.photos/seed/forest/800/1280", width: 800, height: 1280, daysAgo: 24 },
  { id: "4", title: "Ocean waves", description: "Long exposure of waves breaking against a rocky coast.", publicId: `${SEED_FOLDER}/ocean-waves`, fallbackUrl: "https://picsum.photos/seed/ocean/800/960", width: 800, height: 960, daysAgo: 18 },
  { id: "5", title: "Desert dunes", description: "Wind-carved sand dunes catching low golden light.", publicId: `${SEED_FOLDER}/desert-dunes`, fallbackUrl: "https://picsum.photos/seed/desert/800/720", width: 800, height: 720, daysAgo: 14 },
  { id: "6", title: "Autumn leaves", description: "A forest trail buried under red and gold autumn leaves.", publicId: `${SEED_FOLDER}/autumn-leaves`, fallbackUrl: "https://picsum.photos/seed/autumn/800/1200", width: 800, height: 1200, daysAgo: 11 },
  { id: "7", title: "Snowy cabin", description: "A small cabin under fresh snow, high in the mountains.", publicId: `${SEED_FOLDER}/snowy-cabin`, fallbackUrl: "https://picsum.photos/seed/cabin/800/880", width: 800, height: 880, daysAgo: 8 },
  { id: "8", title: "Wildflowers", description: "An alpine meadow of wildflowers below the mountain ridge.", publicId: `${SEED_FOLDER}/wildflowers`, fallbackUrl: "https://picsum.photos/seed/flowers/800/1120", width: 800, height: 1120, daysAgo: 6 },
  { id: "9", title: "Fog over the lake", description: "Still water and low fog just before the light comes up.", publicId: `${SEED_FOLDER}/fog-over-the-lake`, fallbackUrl: "https://picsum.photos/seed/lake/800/1000", width: 800, height: 1000, daysAgo: 5 },
  { id: "10", title: "Ridge line at dusk", description: "The last light along a bare mountain ridge.", publicId: `${SEED_FOLDER}/ridge-line-at-dusk`, fallbackUrl: "https://picsum.photos/seed/ridge/800/620", width: 800, height: 620, daysAgo: 4 },
  { id: "11", title: "Rain on glass", description: "City light broken into colour through a rain-covered window.", publicId: `${SEED_FOLDER}/rain-on-glass`, fallbackUrl: "https://picsum.photos/seed/rain/800/1060", width: 800, height: 1060, daysAgo: 3 },
  { id: "12", title: "Old stone bridge", description: "A moss-covered stone bridge over a forest stream.", publicId: `${SEED_FOLDER}/old-stone-bridge`, fallbackUrl: "https://picsum.photos/seed/bridge/800/900", width: 800, height: 900, daysAgo: 2 },
  { id: "13", title: "First snow", description: "Fresh snow settling on a pine forest trail.", publicId: `${SEED_FOLDER}/first-snow`, fallbackUrl: "https://picsum.photos/seed/snow/800/1180", width: 800, height: 1180, daysAgo: 1 },
  { id: "14", title: "Harbour lights", description: "Boats and harbour light on still evening water.", publicId: `${SEED_FOLDER}/harbour-lights`, fallbackUrl: "https://picsum.photos/seed/harbour/800/760", width: 800, height: 760, daysAgo: 0.5 },
];

/** The fictional accounts whose saves and comments populate the demo. */
export const DEMO_USERS = [
  { id: "demo.aria@pixsift.app", name: "Aria Sharma" },
  { id: "demo.noah@pixsift.app", name: "Noah Bennett" },
  { id: "demo.leah@pixsift.app", name: "Leah Fontaine" },
  { id: "demo.kenji@pixsift.app", name: "Kenji Watanabe" },
  { id: "demo.priya@pixsift.app", name: "Priya Nair" },
  { id: "demo.tomas@pixsift.app", name: "Tomás Ruiz" },
] as const;

/**
 * Who saved what.
 *
 * Not random — the overlaps are shaped so item-item collaborative filtering has
 * something real to find. Aria/Noah/Kenji form a "mountains & snow" cluster,
 * Leah/Priya a "city & rain" one, and Tomás sits across both. So on a mountain
 * pin, collaborative filtering surfaces other mountain pins even though the
 * titles don't overlap.
 */
export const SEED_FAVORITES: Record<string, string[]> = {
  "demo.aria@pixsift.app": ["1", "7", "8", "10", "13", "3"],
  "demo.noah@pixsift.app": ["1", "7", "10", "13", "9"],
  "demo.kenji@pixsift.app": ["1", "8", "10", "13", "12"],
  "demo.leah@pixsift.app": ["2", "11", "14", "4"],
  "demo.priya@pixsift.app": ["2", "11", "14", "9"],
  "demo.tomas@pixsift.app": ["1", "2", "5", "6", "12"],
};

export type SeedComment = {
  pinId: string;
  userId: string;
  body: string;
  minutesAgo: number;
};

export const SEED_COMMENTS: SeedComment[] = [
  { pinId: "1", userId: "demo.aria@pixsift.app", body: "That fog line is unreal. What time did you get up for this?", minutesAgo: 4320 },
  { pinId: "1", userId: "demo.noah@pixsift.app", body: "Saved. This is exactly the kind of light I keep failing to catch.", minutesAgo: 3980 },
  { pinId: "1", userId: "demo.tomas@pixsift.app", body: "The valley depth here is beautiful.", minutesAgo: 1500 },
  { pinId: "2", userId: "demo.leah@pixsift.app", body: "The reflections do all the work. Gorgeous.", minutesAgo: 2600 },
  { pinId: "2", userId: "demo.priya@pixsift.app", body: "Wet streets at night never miss.", minutesAgo: 900 },
  { pinId: "3", userId: "demo.aria@pixsift.app", body: "I want to walk down this immediately.", minutesAgo: 2100 },
  { pinId: "7", userId: "demo.kenji@pixsift.app", body: "Perfect winter mood. The snow texture is lovely.", minutesAgo: 1200 },
  { pinId: "7", userId: "demo.noah@pixsift.app", body: "Cabin goals honestly.", minutesAgo: 640 },
  { pinId: "8", userId: "demo.aria@pixsift.app", body: "The colour in that meadow 😍", minutesAgo: 480 },
  { pinId: "11", userId: "demo.leah@pixsift.app", body: "Rain on glass is such an underrated subject.", minutesAgo: 300 },
  { pinId: "13", userId: "demo.kenji@pixsift.app", body: "First snow always looks best on pines.", minutesAgo: 120 },
  { pinId: "14", userId: "demo.priya@pixsift.app", body: "So calm. Great use of the reflection.", minutesAgo: 45 },
];
