// ── The `pins` collection: the dataset itself ───────────────────────────────
//
// One document = one image in the gallery: its LINK, TITLE and DESCRIPTION plus
// the bookkeeping the app needs (who added it, when, its Cloudinary id, its
// dimensions).
//
// Everything about how this collection is *shaped* lives in this file — the
// document type, the JSON-Schema validator, the indexes, and every query. Nothing
// else in the app talks to `db.collection("pins")` directly, so when a query needs
// a new index, the index is one screen away from the query that needs it.
//
// ── Why it stays fast as the dataset grows ─────────────────────────────────
//  1. `_id` IS the pin id (a string slug, not an ObjectId). Mongo indexes `_id`
//     for free and enforces uniqueness on it, so "fetch one pin" is a single
//     index hit and re-running the seed can't create duplicates.
//  2. The feed is read through a compound index on `{createdAt:-1, _id:-1}` that
//     matches the sort exactly, so Mongo walks the index and stops — it never
//     loads-then-sorts the collection (no in-memory SORT stage, no 32MB limit).
//  3. Paging is keyset ("give me what's older than this"), not `.skip(n)`. Skip
//     has to count past every document it discards, so page 50 costs 50x page 1;
//     keyset costs the same at any depth.
//  4. Every read projects only the fields it uses, so the wire never carries
//     more than the caller needs.

import type { Collection, Filter, IndexDescription } from "mongodb";

import { getDb } from "@/lib/mongodb";
import type { Pin } from "@/lib/pins";

export const PINS_COLLECTION = "pins";

/** How a pin is stored. `createdAt` is a real BSON Date so Mongo can range-scan it. */
export type PinDoc = {
  _id: string;
  title: string;
  description?: string;
  /** The dataset link — a Cloudinary URL, a Pixabay URL, or any pasted image URL. */
  imageUrl: string;
  /** Small preview, when the source gives us one. Cheaper grids. */
  thumbUrl?: string;
  author: string;
  authorId: string;
  createdAt: Date;
  publicId?: string;
  width?: number;
  height?: number;
  /** Where the row came from — lets the seed be re-run without touching uploads. */
  source: "seed" | "upload" | "link";

  // ── Provenance, for images discovered through someone else's API ──────────
  // We store the provider's id rather than trusting the URL, because a URL can
  // change (Pixabay says as much) while the id is stable. Re-fetching a fresh
  // link later only needs `provider` + `providerId`.
  provider?: "pixabay";
  providerId?: string;
  /** Link back to the source page — how we credit the photographer. */
  providerPageUrl?: string;
  credit?: string;

  /**
   * Keywords describing the image. The recommender's best input: matching on
   * shared tags beats guessing from title text, and it's what any "segment"
   * (mountains, city, water…) can be built from.
   */
  tags?: string[];
};

export async function pinsCollection(): Promise<Collection<PinDoc>> {
  const db = await getDb();
  return db.collection<PinDoc>(PINS_COLLECTION);
}

// ── Schema + indexes ────────────────────────────────────────────────────────

/**
 * A validator, so a typo in a script can't quietly write a pin with no link.
 * `moderate` means it applies to inserts and to updates of already-valid
 * documents — it won't reject reads of anything older that predates the rule.
 */
const VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "title", "imageUrl", "authorId", "createdAt"],
    properties: {
      _id: { bsonType: "string" },
      title: { bsonType: "string", minLength: 1, maxLength: 200 },
      description: { bsonType: "string", maxLength: 2000 },
      imageUrl: { bsonType: "string", pattern: "^https?://" },
      thumbUrl: { bsonType: "string", pattern: "^https?://" },
      author: { bsonType: "string" },
      authorId: { bsonType: "string" },
      createdAt: { bsonType: "date" },
      publicId: { bsonType: "string" },
      provider: { enum: ["pixabay"] },
      providerId: { bsonType: "string" },
      providerPageUrl: { bsonType: "string" },
      credit: { bsonType: "string" },
      tags: { bsonType: "array", items: { bsonType: "string" } },
      // "number" covers int/long/double — BSON picks the narrowest type that
      // fits, so pinning this to "int" would reject a perfectly good 800.0.
      width: { bsonType: "number" },
      height: { bsonType: "number" },
      source: { enum: ["seed", "upload", "link"] },
    },
  },
} as const;

const INDEXES: IndexDescription[] = [
  // The main feed: sort newest-first, tie-break on _id so paging is stable when
  // two pins share a timestamp.
  { key: { createdAt: -1, _id: -1 }, name: "feed_newest" },

  // "My pins" / any per-author feed. authorId first (the equality match), then
  // the sort keys — that ordering is what lets one index serve filter AND sort.
  { key: { authorId: 1, createdAt: -1, _id: -1 }, name: "by_author_newest" },

  // Search over title + description. Title is weighted higher so a word in the
  // title outranks the same word buried in a description.
  {
    key: { title: "text", description: "text" },
    name: "search_text",
    weights: { title: 5, description: 1 },
    default_language: "english",
  },

  // Cloudinary assets are 1:1 with pins. Sparse, because link-only pins have no
  // publicId and a plain unique index would treat all those missing values as
  // duplicates of each other.
  { key: { publicId: 1 }, name: "by_public_id", unique: true, sparse: true },

  // One save per user per source image — the database refuses a double-save
  // instead of the UI trying to remember. `partialFilterExpression` (not
  // `sparse`) is what makes this legal on a compound index: without it, every
  // pin that has no providerId would collide with every other one.
  {
    key: { authorId: 1, provider: 1, providerId: 1 },
    name: "unique_save_per_source",
    unique: true,
    partialFilterExpression: { providerId: { $exists: true } },
  },

  // Multikey index over the tag array: "show me more like this" and any
  // tag-based segment become an index lookup rather than a scan.
  { key: { tags: 1, createdAt: -1 }, name: "by_tag_newest" },
];

/**
 * Create the collection (with its validator) and its indexes.
 *
 * Idempotent and memoised: `createIndexes` is a no-op when an index already
 * exists, and the promise is cached so this costs one round trip per process no
 * matter how many callers ask for it.
 */
let ready: Promise<void> | undefined;

export function ensureIndexes(): Promise<void> {
  ready ??= setup().catch((error) => {
    // Don't cache a failure — a transient outage at boot shouldn't leave the
    // process permanently convinced the collection is unusable.
    ready = undefined;
    throw error;
  });
  return ready;
}

async function setup(): Promise<void> {
  const db = await getDb();

  try {
    await db.createCollection(PINS_COLLECTION, {
      validator: VALIDATOR,
      validationLevel: "moderate",
    });
  } catch (error) {
    // 48 = NamespaceExists. The collection is already there, so just make sure
    // its rules are current.
    if ((error as { code?: number }).code !== 48) throw error;
    await db.command({
      collMod: PINS_COLLECTION,
      validator: VALIDATOR,
      validationLevel: "moderate",
    });
  }

  await db.collection(PINS_COLLECTION).createIndexes(INDEXES);
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Only what the grid renders. Explicit, so a future big field (say, an embedding) isn't shipped by accident. */
const LIST_PROJECTION = {
  title: 1,
  description: 1,
  imageUrl: 1,
  thumbUrl: 1,
  author: 1,
  authorId: 1,
  createdAt: 1,
  publicId: 1,
  width: 1,
  height: 1,
  provider: 1,
  providerId: 1,
  providerPageUrl: 1,
  credit: 1,
  tags: 1,
} as const;

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

/**
 * The stored pin, as the app sees it: the existing `Pin` the components already
 * take, plus the provenance a saved-from-elsewhere image carries. It's a
 * superset, so anything that wants a plain `Pin` still accepts one of these.
 */
export type SavedPin = Pin & {
  thumbUrl?: string;
  provider?: PinDoc["provider"];
  providerId?: string;
  providerPageUrl?: string;
  credit?: string;
  tags?: string[];
};

/** Back to the plain object the components take (createdAt as a number). */
export function toPin(doc: PinDoc): SavedPin {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    imageUrl: doc.imageUrl,
    thumbUrl: doc.thumbUrl,
    author: doc.author,
    authorId: doc.authorId,
    createdAt: doc.createdAt.getTime(),
    publicId: doc.publicId,
    width: doc.width,
    height: doc.height,
    provider: doc.provider,
    providerId: doc.providerId,
    providerPageUrl: doc.providerPageUrl,
    credit: doc.credit,
    tags: doc.tags,
  };
}

/**
 * A page cursor is just "the last row you saw" — its timestamp and id — encoded
 * so callers treat it as opaque and can't hand-craft one that skews a query.
 */
function encodeCursor(pin: SavedPin): string {
  return Buffer.from(`${pin.createdAt}.${pin.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const dot = raw.indexOf(".");
  if (dot < 1) return null;

  const createdAt = Number(raw.slice(0, dot));
  const id = raw.slice(dot + 1);
  if (!Number.isFinite(createdAt) || !id) return null;

  return { createdAt: new Date(createdAt), id };
}

export type PinPage = { pins: SavedPin[]; nextCursor: string | null };

/**
 * Newest-first page of pins, optionally for one author.
 *
 * The `$or` is the keyset condition: everything strictly older than the cursor,
 * plus the same-timestamp rows with a smaller id. It reads as a scan starting
 * exactly where the previous page stopped — which is what `feed_newest` (or
 * `by_author_newest`) lets Mongo do.
 */
export async function listPins(
  opts: { limit?: number; cursor?: string | null; authorId?: string } = {},
): Promise<PinPage> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const filter: Filter<PinDoc> = {};

  if (opts.authorId) filter.authorId = opts.authorId;

  if (opts.cursor) {
    const after = decodeCursor(opts.cursor);
    if (after) {
      filter.$or = [
        { createdAt: { $lt: after.createdAt } },
        { createdAt: after.createdAt, _id: { $lt: after.id } },
      ];
    }
  }

  const pins = await pinsCollection();

  // Fetch one extra row: if it comes back, there's another page — no separate
  // count query needed to know that.
  const docs = await pins
    .find(filter, { projection: LIST_PROJECTION })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = docs.length > limit;
  const page = (hasMore ? docs.slice(0, limit) : docs).map(toPin);

  return {
    pins: page,
    nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function getPinById(id: string): Promise<SavedPin | null> {
  const pins = await pinsCollection();
  const doc = await pins.findOne({ _id: id }, { projection: LIST_PROJECTION });
  return doc ? toPin(doc) : null;
}

/** Full-text search across title + description, best match first. */
export async function searchPins(query: string, limit = DEFAULT_LIMIT): Promise<SavedPin[]> {
  const q = query.trim();
  if (!q) return [];

  const pins = await pinsCollection();
  const docs = await pins
    .find(
      { $text: { $search: q } },
      // `textScore` is computed by the index scan; sorting on it costs nothing extra.
      { projection: { ...LIST_PROJECTION, score: { $meta: "textScore" } } },
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(Math.min(Math.max(limit, 1), MAX_LIMIT))
    .toArray();

  return docs.map(toPin);
}

/**
 * "More like this" — other pins sharing any of these tags, most-tags-in-common
 * first.
 *
 * This is the content-based half of the recommender expressed as one aggregation
 * instead of loading the collection into Node and scoring it there. `$match` uses
 * the multikey `by_tag_newest` index, so it only ever touches pins that share at
 * least one tag.
 */
export async function findByTags(
  tags: string[],
  opts: { excludeId?: string; limit?: number } = {},
): Promise<SavedPin[]> {
  if (!tags.length) return [];

  const limit = Math.min(Math.max(opts.limit ?? 12, 1), MAX_LIMIT);
  const pins = await pinsCollection();

  const docs = await pins
    .aggregate<PinDoc>([
      {
        $match: {
          tags: { $in: tags },
          ...(opts.excludeId ? { _id: { $ne: opts.excludeId } } : {}),
        },
      },
      // How many of the requested tags this pin shares — the overlap score.
      { $addFields: { overlap: { $size: { $setIntersection: ["$tags", tags] } } } },
      { $sort: { overlap: -1, createdAt: -1 } },
      { $limit: limit },
      { $project: LIST_PROJECTION },
    ])
    .toArray();

  return docs.map(toPin);
}

/**
 * How many pins exist.
 *
 * Unfiltered, this reads the collection's metadata instead of counting rows —
 * constant time, and accurate enough for a "N photos" label. A per-author count
 * has to actually count, but `by_author_newest` covers it.
 */
export async function countPins(authorId?: string): Promise<number> {
  const pins = await pinsCollection();
  return authorId
    ? pins.countDocuments({ authorId })
    : pins.estimatedDocumentCount();
}

// ── Writing ─────────────────────────────────────────────────────────────────

export type NewPin = {
  title: string;
  description?: string;
  imageUrl: string;
  thumbUrl?: string;
  author: string;
  authorId: string;
  publicId?: string;
  width?: number;
  height?: number;
  source?: PinDoc["source"];
  provider?: PinDoc["provider"];
  providerId?: string;
  providerPageUrl?: string;
  credit?: string;
  tags?: string[];
};

/** Thrown when `unique_save_per_source` rejects a second save of the same image. */
export class AlreadySavedError extends Error {
  constructor() {
    super("You've already saved that image.");
    this.name = "AlreadySavedError";
  }
}

/** Readable, collision-proof ids: `misty-mountains-3f9a2b`. */
function makeId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return `${slug || "pin"}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function createPin(input: NewPin): Promise<SavedPin> {
  const doc: PinDoc = {
    _id: makeId(input.title),
    title: input.title,
    description: input.description,
    imageUrl: input.imageUrl,
    thumbUrl: input.thumbUrl,
    author: input.author,
    authorId: input.authorId,
    publicId: input.publicId,
    width: input.width,
    height: input.height,
    createdAt: new Date(),
    source: input.source ?? (input.publicId ? "upload" : "link"),
    provider: input.provider,
    providerId: input.providerId,
    providerPageUrl: input.providerPageUrl,
    credit: input.credit,
    tags: input.tags?.length ? input.tags : undefined,
  };

  const pins = await pinsCollection();

  try {
    await pins.insertOne(doc);
  } catch (error) {
    // 11000 = duplicate key. The only unique constraint a save can trip is
    // "this user already saved this source image".
    if ((error as { code?: number }).code === 11000) throw new AlreadySavedError();
    throw error;
  }

  return toPin(doc);
}
