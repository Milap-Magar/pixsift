// Uploads the starter gallery into YOUR Cloudinary account.
//
//   bun run seed            upload anything missing
//   bun run seed -- --force re-upload everything, overwriting
//
// Idempotent: each image gets a fixed public id from lib/seed-data.ts, and by
// default an existing asset is left alone. Safe to run repeatedly.
//
// Cloudinary fetches each source URL itself — the bytes never pass through this
// machine, which is both faster and simpler than download-then-upload.
//
// To undo: delete the `pixsift/seed` folder in the Cloudinary console, or
//   cloudinary.api.delete_resources_by_tag('pixsift-seed')

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { v2 as cloudinary } from "cloudinary";

import { SEED_AUTHOR, SEED_PINS, SEED_TAG } from "../lib/seed-data";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_SECRET ?? process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error("✗ Cloudinary isn't configured. Run `bun run cloudinary:check` first.");
  process.exit(1);
}

cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

const force = process.argv.includes("--force");

// Verify credentials before doing anything that writes.
try {
  await cloudinary.api.ping();
} catch (error: unknown) {
  const e = error as { error?: { message?: string }; message?: string };
  console.error(`✗ ${e.error?.message ?? e.message}`);
  console.error("  Run `bun run cloudinary:check` for a diagnosis.");
  process.exit(1);
}

console.log(`Seeding ${SEED_PINS.length} images into '${cloudName}' as ${SEED_AUTHOR.name}`);
console.log(force ? "(--force: overwriting existing assets)\n" : "(skipping any that exist)\n");

let uploaded = 0;
let skipped = 0;
let failed = 0;

/** Only ids confirmed present on the cloud go in the manifest. */
const confirmed: string[] = [];

for (const seed of SEED_PINS) {
  const label = seed.title.padEnd(22);

  if (!force) {
    try {
      await cloudinary.api.resource(seed.publicId);
      console.log(`  ·  ${label} already there`);
      confirmed.push(seed.publicId);
      skipped++;
      continue;
    } catch {
      // Not found — fall through and upload it.
    }
  }

  try {
    const result = await cloudinary.uploader.upload(seed.fallbackUrl, {
      public_id: seed.publicId,
      overwrite: force,
      tags: [SEED_TAG, "pixsift-pin"],
      resource_type: "image",
      context: { caption: seed.title, alt: seed.description },
    });

    console.log(`  ✓  ${label} ${result.width}×${result.height}  ${Math.round(result.bytes / 1024)}KB`);
    confirmed.push(seed.publicId);
    uploaded++;
  } catch (error: unknown) {
    const e = error as { error?: { message?: string }; message?: string };
    console.log(`  ✗  ${label} ${e.error?.message ?? e.message}`);
    failed++;
  }
}

// Record what's actually up there. lib/pins.ts reads this to decide whether to
// serve Cloudinary URLs — without it, a wrong cloud name silently 404s every
// image on the site.
// Resolved relative to this file rather than cwd, so the script works from
// anywhere. (import.meta.dir would be shorter but it's Bun-only, and the repo
// type-checks scripts/ along with everything else.)
const manifestPath = fileURLToPath(new URL("../lib/seed-manifest.ts", import.meta.url));

await writeFile(
  manifestPath,
  `// GENERATED FILE — rewritten by \`bun run seed\`. Don't edit by hand.
//
// Records which seed images have actually been uploaded, and to which cloud.
//
// Why this exists: lib/pins.ts used to switch the gallery over to Cloudinary
// URLs the moment CLOUDINARY_CLOUD_NAME was set. If that value was wrong — or
// right but \`bun run seed\` hadn't run yet — every image on the site 404'd.
// Presence of a config value is not evidence the assets exist. This file is.

export const SEED_MANIFEST: {
  /** The cloud the ids below live in. Null until the first successful seed. */
  cloudName: string | null;
  /** Cloudinary public ids confirmed uploaded. */
  publicIds: string[];
  /** ISO timestamp of the last successful seed, for your own reference. */
  seededAt: string | null;
} = {
  cloudName: ${JSON.stringify(cloudName)},
  publicIds: ${JSON.stringify(confirmed, null, 4).replace(/\n/g, "\n  ")},
  seededAt: ${JSON.stringify(new Date().toISOString())},
};
`,
  "utf8",
);

console.log(`\n${uploaded} uploaded · ${skipped} skipped · ${failed} failed`);
console.log(`Manifest updated: ${confirmed.length} image(s) live on '${cloudName}'.`);

if (confirmed.length > 0) {
  console.log("\nRestart the dev server to pick them up.");
}

process.exit(failed === 0 ? 0 : 1);
