// ── The MongoDB connection ──────────────────────────────────────────────────
//
// ONE client for the whole process, created once and reused forever. This is the
// single biggest "make it fast" decision in the app: a MongoClient owns a pool of
// TCP+TLS sockets to Atlas, and setting one up costs ~100-300ms. Creating a
// client per request would pay that on every page load.
//
// The client is cached on `globalThis` because in dev Next.js hot-reloads modules
// on every save — without the cache each reload would open a brand new pool and
// slowly exhaust the cluster's connection limit.

import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

/** The connection string has no database in its path, so we name it here. */
export const DB_NAME = process.env.MONGODB_DB ?? "pixsift";

const options: MongoClientOptions = {
  // Pool sizing. `minPoolSize` is the one that matters for latency: it keeps a
  // couple of sockets open and authenticated at all times, so the first query
  // after an idle spell doesn't pay for a TLS handshake.
  maxPoolSize: 20,
  minPoolSize: 2,
  maxIdleTimeMS: 60_000,

  // Fail fast instead of hanging a request for 30s (the default) when the
  // cluster is unreachable.
  serverSelectionTimeoutMS: 8_000,

  // Atlas replica sets can hand off a primary mid-query; let the driver retry
  // once rather than surfacing a transient error to the user.
  retryWrites: true,
  retryReads: true,
};

declare global {
  // `var` (not let/const) is what actually augments globalThis.
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * The shared client, created on first use.
 *
 * Connecting lazily (rather than at module scope) is what keeps a missing or
 * unreachable database from breaking `next build`. Turbopack imports every
 * route module while collecting page data, so a module-level throw — or a
 * module-level `.connect()` whose rejection nobody is awaiting yet — takes the
 * whole build down before a single page renders. Deferring both to the first
 * real query means a misconfigured deploy surfaces as a failing request we can
 * report, not a red build.
 */
export function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_CONNECT_URL;
  if (!uri) {
    throw new Error(
      "MONGODB_CONNECT_URL is not set — add it to .env locally, or to the " +
        "project's Environment Variables on your host, then redeploy.",
    );
  }

  // A rejected connect must not be cached, or one blip would poison the
  // process forever; clear the slot so the next caller retries.
  globalThis._mongoClientPromise ??= new MongoClient(uri, options)
    .connect()
    .catch((error: unknown) => {
      globalThis._mongoClientPromise = undefined;
      throw error;
    });

  return globalThis._mongoClientPromise;
}

/** The database every collection helper in lib/db/ goes through. */
export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(DB_NAME);
}
