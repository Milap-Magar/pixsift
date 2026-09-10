import "server-only";

// ── Where the algorithms meet the app ───────────────────────────────────────
//
// Two jobs, both about TIMING rather than about the maths:
//
//   `guardAgainstDuplicates`  runs BEFORE a pin is written, because its whole
//                             purpose is to stop one being written.
//   `analyzeInBackground`     runs AFTER the response is sent, because its
//                             results are not needed to answer the request.
//
// Getting that split right is most of what makes the feature feel free. A photo
// posts in the time it takes to upload it; the hash and the palette land a
// moment later, and the pin's page shows them on the next visit.

import { after } from "next/server";

import { setPinAnalysis } from "@/lib/db/pins";
import { listPinHashes } from "@/lib/db/pins";

import { analyzeImage, type ImageAnalysis } from "./analyze";
import { findNearDuplicates, type DuplicateVerdict } from "./hamming";

/** What the UI needs to show "you may already have this one". */
export type DuplicateWarning = {
  pinId: string;
  title: string;
  imageUrl: string;
  /** Differing bits, 0–64. Shown, because a number invites a judgement call. */
  distance: number;
  verdict: DuplicateVerdict;
};

export type DuplicateCheck = {
  analysis: ImageAnalysis;
  warning?: DuplicateWarning;
};

/**
 * Hash an image and look for one already in the viewer's library that matches.
 *
 * Called on the posting path with the bytes already in hand, BEFORE anything is
 * uploaded or written. Ordering it that way means a rejected duplicate costs
 * nothing: no Cloudinary asset to orphan, no row to delete.
 *
 * The analysis is returned alongside the warning whether or not a duplicate was
 * found, so the caller can store it on the new pin without decoding the image a
 * second time.
 *
 * `viewerId` scopes the search to what that person may see — their own pins plus
 * everything public. It is not an optimisation. Near-duplicate detection is, by
 * construction, a way to ask "is there an image like this one?", so a version
 * that scanned every row would let anyone confirm the existence and title of
 * somebody's private pin by posting something similar and reading the warning.
 */
export async function guardAgainstDuplicates(
  source: Buffer | string,
  viewerId: string,
): Promise<DuplicateCheck> {
  const analysis = await analyzeImage(source);

  // No hash means the image could not be decoded. There is nothing to compare,
  // and refusing the post over it would be punishing the user for our failure.
  if (!analysis.phash) return { analysis };

  const candidates = await listPinHashes({ viewerId });
  const [closest] = findNearDuplicates(analysis.phash, candidates, { limit: 1 });

  if (!closest) return { analysis };

  return {
    analysis,
    warning: {
      pinId: closest.item.id,
      title: closest.item.title,
      imageUrl: closest.item.imageUrl,
      distance: closest.distance,
      verdict: closest.verdict,
    },
  };
}

/**
 * Store an analysis we already computed.
 *
 * Separate from `analyzeInBackground` because the posting path has already paid
 * for the decode during the duplicate check — re-running it after the response
 * would double the work to reach an identical answer.
 */
export async function storeAnalysis(pinId: string, analysis: ImageAnalysis): Promise<void> {
  if (!analysis.analyzed) return;

  try {
    await setPinAnalysis(pinId, { phash: analysis.phash, palette: analysis.palette });
  } catch (error) {
    console.error(`storeAnalysis: couldn't save analysis for ${pinId}:`, error);
  }
}

/**
 * Analyse an image after the response has been sent.
 *
 * For the paths that have a URL rather than bytes — saving a Pixabay photo, or
 * `POST /api/pins` — where fetching and decoding the image would add seconds to
 * a request whose answer does not depend on the result.
 *
 * `after()` (next/server) is what makes this safe rather than a floating
 * promise. A bare `void analyze(...)` works on a long-lived server and loses the
 * work on a serverless platform, which may freeze the instance the moment the
 * response is flushed. `after` tells the runtime the request is not finished
 * until this callback is, so the work is kept alive without the user waiting on
 * it.
 *
 * Every failure is swallowed after logging. This runs when nobody is listening;
 * throwing here can only produce an unhandled rejection, and the pin is already
 * saved and correct without a palette. `scripts/analyze-pins.mts` sweeps up
 * whatever this misses.
 */
export function analyzeInBackground(pinId: string, imageUrl: string): void {
  after(async () => {
    try {
      const analysis = await analyzeImage(imageUrl);

      if (!analysis.analyzed) {
        console.warn(`analyzeInBackground: nothing to store for ${pinId}: ${analysis.error}`);
      }

      // Written even when empty — `setPinAnalysis` stamps `analyzedAt`, which is
      // what stops the backfill script retrying an image that will never decode.
      await setPinAnalysis(pinId, { phash: analysis.phash, palette: analysis.palette });
    } catch (error) {
      console.error(`analyzeInBackground: failed for ${pinId}:`, error);
    }
  });
}
