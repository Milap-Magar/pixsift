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
//
// ── Public vs private ───────────────────────────────────────────────────────
// Every pin carries a `visibility`. The rule ("public is for everyone, private
// is for its author") is enforced by ONE function — `visibleTo(viewerId)` — that
// every read in this file mixes into its filter. Doing it in the query rather
// than in the pages means a private pin can't leak through a route handler, a
// Server Action, or a page someone forgot to update: there is no code path that
// reads pins without going through here.

import type { Collection, Db, Filter, IndexDescription } from "mongodb";

import { getDb } from "@/lib/mongodb";
import type { Pin } from "@/lib/pins";
import { DEFAULT_VISIBILITY, type Visibility } from "@/lib/visibility";

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

  /**
   * `public` (in the feed) or `private` (author only).
   *
   * Stored on every document rather than left to default when absent, so the
   * queries can match on equality (`visibility: "public"`), which an index can
   * seek. `{ visibility: { $ne: "private" } }` would read the same but forces a
   * scan of the whole index instead of jumping straight to the public rows.
   * `ensureIndexes()` backfills rows written before this field existed.
   */
  visibility: Visibility;

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
      // Not in `required`: rows written before this field existed are still
      // valid documents, and `ensureIndexes()` fills them in on the next boot.
      visibility: { enum: ["public", "private"] },
    },
  },
} as const;

const INDEXES: IndexDescription[] = [
  // The main feed: every public pin, newest-first, tie-broken on _id so paging
  // is stable when two pins share a timestamp.
  //
  // `visibility` comes FIRST even though the interesting part is the sort. The
  // rule for a compound index is equality → sort → range: with visibility
  // leading, Mongo seeks to the block of public rows and then walks it in
  // exactly the order we asked for. Put createdAt first instead and it has to
  // scan every private row and throw it away.
  { key: { visibility: 1, createdAt: -1, _id: -1 }, name: "feed_public_newest" },

  // The same walk with no visibility term — what `listAllPins` does for a viewer
  // who can see their own private pins as well as everyone's public ones.
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

  await backfillVisibility(db);

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

/**
 * Stamp `visibility: "public"` onto rows that predate the field.
 *
 * A migration, but a safe one to run on every boot: after the first pass the
 * filter matches nothing, so it costs one indexed no-op query. Cheap enough that
 * it doesn't need a separate script anyone can forget to run.
 *
 * Why bother instead of treating "missing" as public in the queries? Because
 * then every read would need `{ $or: [{visibility:"public"}, {visibility:{$exists:false}}] }`
 * forever, and the feed index could no longer seek — see the note on PinDoc.
 */
async function backfillVisibility(db: Db): Promise<void> {
  await db
    .collection<PinDoc>(PINS_COLLECTION)
    .updateMany(
      { visibility: { $exists: false } },
      { $set: { visibility: DEFAULT_VISIBILITY } },
    );
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * The one place the public/private rule is expressed: everything public, plus
 * the viewer's own pins whatever their visibility. Signed out, only public.
 *
 * Every read in this file starts from this filter. `viewerId` is always the id
 * from the session (`currentUser()`), never a value the caller sent us — that
 * distinction is the whole security boundary, because an id off the wire would
 * let anyone read anyone's private pins by claiming to be them.
 */
function visibleTo(viewerId?: string): Filter<PinDoc> {
  const isPublic: Filter<PinDoc> = { visibility: "public" };
  return viewerId ? { $or: [isPublic, { authorId: viewerId }] } : isPublic;
}

/**
 * Combine independent conditions.
 *
 * Needed because two of ours are `$or`s (the visibility rule and the keyset
 * cursor) and an object can only hold one `$or` key — the second would silently
 * overwrite the first, which in this case means silently serving private pins.
 * `$and` keeps them as separate clauses.
 */
function every(conditions: Array<Filter<PinDoc> | null>): Filter<PinDoc> {
  const clauses = conditions.filter((clause): clause is Filter<PinDoc> => clause !== null);
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

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
  visibility: 1,
} as const;

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

/**
 * Ceiling for the "load everything and rank it in Node" reads (Discover's topic
 * chips, the popularity leaderboard, the recommender's candidate pool). Those
 * algorithms need the whole set rather than a page of it, so the honest thing is
 * a stated cap — an uncapped `find()` is a query that works until the day it
 * doesn't.
 */
const MAX_SCAN = 500;

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
  visibility: Visibility;
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
    // `?? DEFAULT_VISIBILITY` is belt-and-braces for a row the backfill hasn't
    // reached yet (a write from an older instance mid-deploy). It only affects
    // how the tile is LABELLED — what you're allowed to read is decided by the
    // query, not by this line.
    visibility: doc.visibility ?? DEFAULT_VISIBILITY,
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

/** Everything strictly older than the cursor — the keyset condition. */
function after(cursor: string | null | undefined): Filter<PinDoc> | null {
  if (!cursor) return null;

  const position = decodeCursor(cursor);
  if (!position) return null;

  return {
    $or: [
      { createdAt: { $lt: position.createdAt } },
      { createdAt: position.createdAt, _id: { $lt: position.id } },
    ],
  };
}

/**
 * Newest-first page of pins the viewer is allowed to see, optionally for one
 * author.
 *
 * Reads as a scan starting exactly where the previous page stopped — which is
 * what `feed_public_newest` (or `by_author_newest`) lets Mongo do.
 *
 * `viewerId` widens the result to include that person's own private pins. Leave
 * it out for anything served from a SHARED cache: `/api/feed` and `/api/pins`
 * hand their responses to a CDN with `s-maxage`, and a viewer-specific page
 * stored under a viewer-agnostic key is how one user's private pin ends up in
 * someone else's feed.
 */
export async function listPins(
  opts: {
    limit?: number;
    cursor?: string | null;
    authorId?: string;
    viewerId?: string;
  } = {},
): Promise<PinPage> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const filter = every([
    visibleTo(opts.viewerId),
    opts.authorId ? { authorId: opts.authorId } : null,
    after(opts.cursor),
  ]);

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

/**
 * One pin, or `null` — which is also the answer when it exists but isn't the
 * viewer's to see.
 *
 * Returning `null` rather than throwing a "forbidden" is deliberate: a 404 and a
 * 403 differ in what they leak. A 403 confirms that `/pin/holiday-photos-9f2a1c`
 * is a real pin, which is exactly the fact a private pin is hiding.
 */
export async function getPinById(id: string, viewerId?: string): Promise<SavedPin | null> {
  const pins = await pinsCollection();
  const doc = await pins.findOne(every([{ _id: id }, visibleTo(viewerId)]), {
    projection: LIST_PROJECTION,
  });
  return doc ? toPin(doc) : null;
}

/**
 * Several pins by id, newest first. Skips any the viewer can't see.
 *
 * One query for the whole list rather than a `getPinById` per id: favourites are
 * stored as a set of ids, and fetching 30 of them one at a time is 30 round trips
 * to Atlas where `$in` is one.
 */
export async function getPinsByIds(ids: string[], viewerId?: string): Promise<SavedPin[]> {
  if (ids.length === 0) return [];

  const pins = await pinsCollection();
  const docs = await pins
    .find(every([{ _id: { $in: ids } }, visibleTo(viewerId)]), { projection: LIST_PROJECTION })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_SCAN)
    .toArray();

  return docs.map(toPin);
}

/**
 * Every pin the viewer can see, newest first, capped at `MAX_SCAN`.
 *
 * For the pages whose logic genuinely needs the whole collection at once rather
 * than a page of it: Discover's topic extraction (it computes document
 * frequencies), the popularity leaderboard (it re-sorts by score), and the
 * recommender's candidate pool.
 */
export async function listAllPins(
  opts: { viewerId?: string; limit?: number } = {},
): Promise<SavedPin[]> {
  const pins = await pinsCollection();
  const docs = await pins
    .find(visibleTo(opts.viewerId), { projection: LIST_PROJECTION })
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.min(Math.max(opts.limit ?? MAX_SCAN, 1), MAX_SCAN))
    .toArray();

  return docs.map(toPin);
}

/**
 * Full-text search across title + description, best match first.
 *
 * The visibility clause rides along with the `$text` match, so a private pin
 * can't be fished out by searching for a word in its title.
 */
export async function searchPins(
  query: string,
  opts: { limit?: number; viewerId?: string } = {},
): Promise<SavedPin[]> {
  const q = query.trim();
  if (!q) return [];

  const pins = await pinsCollection();
  const docs = await pins
    .find(
      every([{ $text: { $search: q } }, visibleTo(opts.viewerId)]),
      // `textScore` is computed by the index scan; sorting on it costs nothing extra.
      { projection: { ...LIST_PROJECTION, score: { $meta: "textScore" } } },
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT))
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
 *
 * Public pins only, even for a signed-in author: this feeds "already in the
 * gallery" on a Pixabay photo's page, which is a recommendation surface. Your own
 * private pin turning up as a suggestion under a public photo is not what
 * "private" means to the person who set it.
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
          visibility: "public",
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
 * With no author, this counts the public ones — the number every visitor's view
 * of the gallery agrees on. A per-author count is that author's own total,
 * private pins included, because it's shown to them about their own board.
 * `by_author_newest` covers it.
 */
export async function countPins(authorId?: string): Promise<number> {
  const pins = await pinsCollection();
  return pins.countDocuments(authorId ? { authorId } : { visibility: "public" });
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
  visibility?: Visibility;
};

/** Thrown when `unique_save_per_source` rejects a second save of the same image. */
export class AlreadySavedError extends Error {
  constructor() {
    super("You've already saved that image.");
    this.name = "AlreadySavedError";
  }
}

/**
 * Drop the keys whose value is `undefined`.
 *
 * The driver does not skip them for you: by default it serialises `undefined` as
 * `null`, so `description: undefined` arrives as `description: null` and the
 * validator rejects it for not being a string. An uploaded or link-only pin
 * leaves nine of these fields unset (thumbUrl, provider, tags…), so without this
 * every such insert fails with error 121, "Document failed validation" — while a
 * fully-populated Pixabay save goes through, which is a fun way to spend an
 * afternoon.
 *
 * Done here rather than with `ignoreUndefined: true` on the MongoClient so the
 * reason lives next to the insert it protects.
 */
function defined<T extends object>(doc: T): T {
  return Object.fromEntries(
    Object.entries(doc).filter(([, value]) => value !== undefined),
  ) as T;
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
    visibility: input.visibility ?? DEFAULT_VISIBILITY,
  };

  const pins = await pinsCollection();

  try {
    await pins.insertOne(defined(doc));
  } catch (error) {
    // 11000 = duplicate key. The only unique constraint a save can trip is
    // "this user already saved this source image".
    if ((error as { code?: number }).code === 11000) throw new AlreadySavedError();
    throw error;
  }

  return toPin(doc);
}

/**
 * Flip one pin between public and private. Returns the updated pin, or `null` if
 * there's no such pin **owned by this author**.
 *
 * Ownership is part of the filter rather than a separate read-then-check. Two
 * reasons: it's one round trip instead of two, and there's no window between the
 * check and the write for anything to change underneath it. The caller passes the
 * id it was given and the author id from the session — never an author id from
 * the request, which would make the check meaningless.
 */
export async function updatePinVisibility(
  id: string,
  authorId: string,
  visibility: Visibility,
): Promise<SavedPin | null> {
  const pins = await pinsCollection();

  const doc = await pins.findOneAndUpdate(
    { _id: id, authorId },
    { $set: { visibility } },
    { returnDocument: "after", projection: LIST_PROJECTION },
  );

  return doc ? toPin(doc) : null;
}
