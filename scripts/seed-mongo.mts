// Uploads the starter dataset — link, title, description — into MongoDB.
//
//   bun run db:seed             create the collection + indexes, upsert the dataset
//   bun run db:seed -- --force  overwrite rows that already exist
//   bun run db:seed -- --drop   delete the collection first, then reseed
//
// Idempotent: each pin's `_id` is its fixed seed id, so a re-run updates the same
// 14 documents instead of adding 14 more. Without --force, existing rows keep any
// edits you made in Atlas — only missing ones are inserted.
//
// The whole dataset goes over the wire in ONE `bulkWrite` rather than 14
// `insertOne`s: one round trip to Atlas instead of fourteen, and `ordered: false`
// lets the server apply them in parallel.

// Runs on NODE (via tsx), not Bun — see the note at the bottom of the file.

import { SEED_AUTHOR, SEED_PINS, daysAgo } from "../lib/seed-data";
import { seedImageUrl } from "../lib/pins";
import { PINS_COLLECTION, ensureIndexes, pinsCollection, type PinDoc } from "../lib/db/pins";
// Named import, not the default one: the default survives Next's bundler fine,
// but under tsx's ESM/CJS interop it arrives wrapped and `.close()` goes missing.
import { clientPromise, DB_NAME } from "../lib/mongodb";

const force = process.argv.includes("--force");
const drop = process.argv.includes("--drop");

const started = Date.now();

try {
  if (drop) {
    const client = await clientPromise;
    await client.db(DB_NAME).collection(PINS_COLLECTION).drop().catch(() => {
      // 26 = NamespaceNotFound — nothing to drop, which is fine.
    });
    console.log(`· dropped ${DB_NAME}.${PINS_COLLECTION}`);
  }

  // Creates the collection with its validator, then its indexes. Doing this
  // BEFORE the write means the unique/text indexes exist from the first document.
  await ensureIndexes();

  const pins = await pinsCollection();
  console.log(
    `· ${DB_NAME}.${PINS_COLLECTION} ready (validator + ${(await pins.indexes()).length} indexes)`,
  );

  const operations = SEED_PINS.map((seed) => {
    const doc: Omit<PinDoc, "_id"> = {
      title: seed.title,
      description: seed.description,
      imageUrl: seedImageUrl(seed),
      author: SEED_AUTHOR.name,
      authorId: SEED_AUTHOR.id,
      createdAt: new Date(daysAgo(seed.daysAgo)),
      width: seed.width,
      height: seed.height,
      source: "seed" as const,
      // The starter gallery is the public demo, so it's public. Note that
      // --force would push this back onto a seed pin you'd since made private;
      // the default (`$setOnInsert`) never touches an existing row.
      visibility: "public" as const,
    };

    // Cloudinary hasn't got this one yet — leave publicId unset rather than
    // writing an id that resolves to a 404.
    if (doc.imageUrl.includes("res.cloudinary.com")) {
      doc.publicId = seed.publicId;
    }

    return {
      updateOne: {
        filter: { _id: seed.id },
        // --force overwrites everything; the default only fills in new rows.
        update: force ? { $set: doc } : { $setOnInsert: doc },
        upsert: true,
      },
    };
  });

  const result = await pins.bulkWrite(operations, { ordered: false });

  const total = await pins.estimatedDocumentCount();
  console.log(
    `✓ ${result.upsertedCount} inserted, ${result.modifiedCount} updated, ` +
      `${SEED_PINS.length - result.upsertedCount - result.modifiedCount} unchanged`,
  );
  console.log(`  ${total} pins in the collection (${Date.now() - started}ms)`);

  if (!force && result.upsertedCount === 0 && result.modifiedCount === 0) {
    console.log("  (already seeded — pass --force to overwrite)");
  }
} catch (error) {
  const e = error as { code?: number; codeName?: string; message?: string };
  console.error(`✗ ${e.message ?? error}`);

  if (e.code === 13 || e.codeName === "Unauthorized") {
    console.error("  That Mongo user can't write. Give it readWrite on this database in Atlas.");
  }
  if (e.code === 8000) {
    console.error("  Check MONGODB_CONNECT_URL credentials, and that your IP is on the Atlas access list.");
  }

  process.exitCode = 1;
} finally {
  await (await clientPromise).close();
}

// ── Why Node and not Bun? ───────────────────────────────────────────────────
// The other scripts here run under Bun, but the Mongo driver can't: Bun 1.3 on
// Windows fails `dns.resolveSrv`, so a `mongodb+srv://` URI never resolves, and
// bson's `node:v8` snapshot probe throws at import time. `tsx` runs the same
// TypeScript on Node, where both work. See package.json → "db:seed".
