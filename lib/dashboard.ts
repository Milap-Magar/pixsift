import "server-only";

// ── The numbers behind /dashboard ───────────────────────────────────────────
//
// One function, `dashboardStats()`, that gathers everything the dashboard
// renders. Kept out of the page for two reasons: the page stays about layout,
// and the reads can be issued together rather than in whatever order the JSX
// happens to need them.
//
// ── What is honest about these numbers, and what is not ────────────────────
// Pins come from MongoDB and are real. FAVOURITES AND COMMENTS DO NOT — they
// still live in the in-memory maps in lib/pins.ts and lib/comments.ts, so they
// reset when the server restarts and are not shared between instances. The
// dashboard therefore labels those two figures rather than presenting them as
// durable, because a stat card that quietly resets to zero overnight is worse
// than one that says why. Moving them to collections is the next schema change
// (see docs/ROADMAP.md).

import {
  analysisCoverage,
  listAllPins,
  listPinHashes,
  type SavedPin,
} from "@/lib/db/pins";
import { clusterDuplicates, DUPLICATE_THRESHOLD } from "@/lib/algorithms/hamming";
import { colorFamily, type ColorFamily, COLOR_FAMILIES } from "@/lib/algorithms/color";
import { countComments } from "@/lib/comments";
import { getAllFavoriteSets, getFavoriteIds } from "@/lib/pins";

export type ActivityPoint = { date: string; label: string; pins: number };

export type FamilySlice = {
  key: ColorFamily;
  label: string;
  swatch: string;
  /** Number of the viewer's pins whose palette contains this family. */
  pins: number;
  /**
   * Total palette share this family accounts for across those pins, as a
   * fraction of the viewer's whole library. This is the honest "how much of
   * what I shoot is green" number — counting pins would treat a photo with a
   * single green leaf the same as one that is entirely forest.
   */
  weight: number;
};

export type TopPin = {
  pin: SavedPin;
  saves: number;
  comments: number;
  score: number;
};

export type DashboardStats = {
  counts: {
    mine: number;
    saved: number;
    comments: number;
  };
  analysis: {
    total: number;
    analyzed: number;
    /** 0–1. Drives the coverage bar. */
    coverage: number;
    duplicateGroups: number;
    duplicatePins: number;
    threshold: number;
  };
  /** Pins added per day over the last fortnight — the "keep posting" nudge. */
  activity: ActivityPoint[];
  /** Colour families across the viewer's own pins, biggest weight first. */
  palette: FamilySlice[];
  /** The viewer's own best-performing pins. */
  top: TopPin[];
  /**
   * The viewer's OWN pins, newest first.
   *
   * Every figure on the dashboard is about your board, so this is the only pin
   * list it loads. An earlier version read every visible pin and filtered in
   * Node, which computed the same stats correctly but left the full list in
   * scope — and "Recently added" duly rendered other people's uploads on a page
   * headed "your board". Not fetching them is a better fix than remembering not
   * to render them.
   */
  myPins: SavedPin[];
};

/** How many days of history the activity chart shows. */
const ACTIVITY_DAYS = 14;

export async function dashboardStats(user: { id: string }): Promise<DashboardStats> {
  const favoriteIds = getFavoriteIds(user.id);

  // Three independent reads, so they overlap rather than queue. `listPinHashes`
  // is projected down to four fields precisely so it can ride along with the
  // full read without doubling the bytes on the wire.
  //
  // `authorId` scopes the pin read to this user's own board. The hash read is
  // scoped by VIEWER instead, deliberately: duplicate detection is about "is
  // there an image like this one anywhere I can see", so it must include public
  // pins by other people.
  const [myPins, coverage, hashes] = await Promise.all([
    listAllPins({ viewerId: user.id, authorId: user.id }),
    analysisCoverage(user.id),
    listPinHashes({ viewerId: user.id }),
  ]);

  // ── Duplicates ────────────────────────────────────────────────────────────
  const groups = clusterDuplicates(hashes, DUPLICATE_THRESHOLD);

  // ── Activity ──────────────────────────────────────────────────────────────
  // Bucketed by LOCAL date, not UTC: "how many did I post today" should agree
  // with the user's own calendar, and a UTC bucket puts an evening post in
  // Kathmandu (UTC+5:45) into tomorrow.
  const byDay = new Map<string, number>();
  for (const pin of myPins) {
    const key = localDateKey(new Date(pin.createdAt));
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const activity: ActivityPoint[] = [];
  for (let daysAgo = ACTIVITY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const day = new Date();
    day.setDate(day.getDate() - daysAgo);
    const key = localDateKey(day);

    activity.push({
      date: key,
      label: day.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      // Every day in the window appears, including the empty ones. A chart that
      // only plots days with activity silently compresses a two-week gap into
      // one gridline and makes a dormant fortnight look like steady posting.
      pins: byDay.get(key) ?? 0,
    });
  }

  // ── Colour families ───────────────────────────────────────────────────────
  const familyWeights = new Map<ColorFamily, { pins: number; weight: number }>();
  let palettedPins = 0;

  for (const pin of myPins) {
    if (!pin.palette?.length) continue;
    palettedPins++;

    // A pin can contribute to a family only once, however many of its swatches
    // land in that bucket — otherwise a photo with four shades of blue would
    // count as four blue pins.
    const seen = new Set<ColorFamily>();

    for (const swatch of pin.palette) {
      const family = colorFamily(swatch);
      const entry = familyWeights.get(family) ?? { pins: 0, weight: 0 };

      entry.weight += swatch.share;
      if (!seen.has(family)) {
        entry.pins++;
        seen.add(family);
      }

      familyWeights.set(family, entry);
    }
  }

  const palette: FamilySlice[] = COLOR_FAMILIES.map(({ key, label, swatch }) => {
    const entry = familyWeights.get(key);
    return {
      key,
      label,
      swatch,
      pins: entry?.pins ?? 0,
      // Divided by the number of pins that HAVE a palette, not by every pin, so
      // the slices sum to ~1 and an unanalysed backlog doesn't silently shrink
      // every bar.
      weight: palettedPins ? (entry?.weight ?? 0) / palettedPins : 0,
    };
  })
    .filter((slice) => slice.pins > 0)
    .sort((a, b) => b.weight - a.weight);

  // ── Top pins ──────────────────────────────────────────────────────────────
  const favoriteSets = getAllFavoriteSets();

  const top: TopPin[] = myPins
    .map((pin) => {
      let saves = 0;
      for (const set of favoriteSets.values()) if (set.has(pin.id)) saves++;

      const comments = countComments(pin.id);

      // Same weighting as /most-popular (lib/popularity.ts): a save is a
      // stronger signal than a comment, so the two pages can't disagree about
      // which pin is doing well.
      return { pin, saves, comments, score: saves * 3 + comments };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.pin.createdAt - a.pin.createdAt)
    .slice(0, 5);

  return {
    counts: {
      mine: myPins.length,
      saved: favoriteIds.size,
      comments: myPins.reduce((total, pin) => total + countComments(pin.id), 0),
    },
    analysis: {
      total: coverage.total,
      analyzed: coverage.analyzed,
      coverage: coverage.total ? coverage.analyzed / coverage.total : 1,
      duplicateGroups: groups.length,
      duplicatePins: groups.reduce((total, group) => total + group.items.length, 0),
      threshold: DUPLICATE_THRESHOLD,
    },
    activity,
    palette,
    top,
    myPins,
  };
}

/** `YYYY-MM-DD` in the server's local timezone. */
function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
