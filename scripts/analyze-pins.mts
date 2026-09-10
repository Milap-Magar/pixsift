// ── Backfill: compute the hash and palette for pins that don't have one ─────
//
//   bun run db:analyze            analyse everything still missing
//   bun run db:analyze -- --all   re-analyse EVERY pin, including done ones
//   bun run db:analyze -- --limit 50
//
// Two reasons this exists. The obvious one: pins created before the algorithms
// were written have no `phash` and no `palette`, and every feature built on
// them would skip those rows forever. The less obvious one: analysis on the
// posting path is deliberately best-effort — a Pixabay host that times out
// leaves a pin unanalysed on purpose, because failing the post would be worse.
// Something has to sweep those up, and this is it.
//
// Re-runnable and safe to interrupt. Each pin is written as soon as it is
// analysed rather than batched at the end, so a crash halfway through keeps the
// work already done and the next run picks up exactly where this one stopped.

import { setPinAnalysis, listUnanalysedPins, listAllPins, ensureIndexes } from "../lib/db/pins";
import { analyzeImage } from "../lib/algorithms/analyze";
import { getClient } from "../lib/mongodb";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : (process.argv[index + 1] ?? "");
}

const reanalyseEverything = process.argv.includes("--all");
const limit = Number(flag("limit") ?? 500) || 500;

async function main() {
  // The partial indexes this script queries against are created here.
  await ensureIndexes();

  const pins = reanalyseEverything
    ? await listAllPins({ limit })
    : await listUnanalysedPins(limit);

  if (pins.length === 0) {
    console.log("Nothing to analyse — every pin already has a hash and a palette.");
    return;
  }

  console.log(
    `Analysing ${pins.length} pin${pins.length === 1 ? "" : "s"}${reanalyseEverything ? " (--all)" : ""}…\n`,
  );

  let hashed = 0;
  let palettes = 0;
  let failed = 0;

  for (const [index, pin] of pins.entries()) {
    const position = `[${String(index + 1).padStart(String(pins.length).length)}/${pins.length}]`;

    // Sequential, not `Promise.all`. Each iteration downloads and decodes a
    // full-size photograph, so twenty at once is twenty multi-megabyte buffers
    // resident simultaneously — and it points a burst of requests at one image
    // host, which is how a backfill gets rate-limited. Slow and finished beats
    // fast and throttled for a job nobody is watching.
    const analysis = await analyzeImage(pin.imageUrl);

    if (analysis.phash) hashed++;
    if (analysis.palette?.length) palettes++;

    if (!analysis.analyzed) {
      failed++;
      console.log(`${position} ✗ ${pin.id} — ${analysis.error ?? "no result"}`);
    } else {
      const swatches = analysis.palette?.slice(0, 3).map((s) => s.hex).join(" ") ?? "";
      console.log(`${position} ✓ ${pin.id}  ${analysis.phash ?? "—"}  ${swatches}`);
    }

    // Written even on failure. `setPinAnalysis` stamps `analyzedAt` regardless,
    // which is what takes a permanently-broken image URL out of the queue —
    // without it, every future run would retry the same dead links first and
    // never reach the pins behind them.
    await setPinAnalysis(pin.id, { phash: analysis.phash, palette: analysis.palette });
  }

  console.log(
    `\nDone. ${hashed} hashed, ${palettes} palettes, ${failed} failed out of ${pins.length}.`,
  );
}

main()
  .catch((error) => {
    console.error("\nBackfill failed:", error);
    process.exitCode = 1;
  })
  // Without this the MongoDB driver's connection pool keeps the event loop
  // alive and the script hangs after printing its summary. Same pattern as
  // scripts/seed-mongo.mts.
  .finally(async () => {
    await (await getClient()).close();
  });
