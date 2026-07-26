// Runs ONCE per server instance, before the first request is served.
//
// This is where index setup belongs. Doing it here — rather than lazily inside a
// query helper — means no request ever pays for a `createIndexes` round trip, and
// a fresh deploy against an empty database is correctly indexed from its very
// first read.

export async function register() {
  // Also called for the edge runtime, where the Mongo driver can't run.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureIndexes } = await import("@/lib/db/pins");

  try {
    await ensureIndexes();
  } catch (error) {
    // A database that's unreachable at boot shouldn't stop the server from
    // starting — pages that don't touch Mongo still work, and the next caller
    // retries (ensureIndexes doesn't cache failures).
    console.error("⚠ Could not prepare MongoDB indexes:", (error as Error).message);
  }
}
