// ── The endless feed ────────────────────────────────────────────────────────
//
// The home page never runs out. It plays your own gallery first — every pin
// anyone has saved into MongoDB, newest first — and when that's exhausted it
// keeps going with fresh photos from Pixabay, topic by topic. Roughly six
// thousand images deep before it has anything to apologise for.
//
// The trick is that BOTH phases are addressed by one opaque cursor, so the
// client doesn't know or care where it is:
//
//   d.<createdAt>.<id>   still walking the database (keyset paging)
//   p.<topic>.<page>     into Pixabay: topic N of TOPICS, page P
//
// Handing the caller one cursor instead of two means the transition between the
// two sources is invisible — no "end of your pins" seam, no second scroller.

import { listPins, type SavedPin } from "@/lib/db/pins";
import { isPixabayConfigured, searchImages, type PixabayImage } from "@/lib/pixabay";

/**
 * What the endless half scrolls through, in order.
 *
 * Broad topics on purpose: each one is worth ~500 images (Pixabay's paging cap),
 * and they're varied enough that the wall doesn't turn into fifty photos of the
 * same lake. Reorder freely — it's the feed's editorial voice.
 */
const TOPICS = [
  "landscape",
  "city",
  "ocean",
  "forest",
  "architecture",
  "animals",
  "flowers",
  "food",
  "travel",
  "night sky",
  "minimal",
  "street photography",
] as const;

/** Pixabay stops paging past ~500 results, so this is the real ceiling per topic. */
const MAX_PIXABAY_PAGES = 16;

export type FeedItem =
  | { kind: "pin"; id: string; pin: SavedPin }
  | { kind: "result"; id: string; image: PixabayImage };

export type FeedPage = { items: FeedItem[]; nextCursor: string | null };

type Position =
  | { phase: "db"; cursor: string | null }
  | { phase: "pixabay"; topic: number; page: number };

const encode = (position: Position): string =>
  Buffer.from(
    position.phase === "db"
      ? `d.${position.cursor ?? ""}`
      : `p.${position.topic}.${position.page}`,
  ).toString("base64url");

function decode(cursor: string | null | undefined): Position {
  if (!cursor) return { phase: "db", cursor: null };

  const raw = Buffer.from(cursor, "base64url").toString("utf8");

  if (raw.startsWith("d.")) {
    const inner = raw.slice(2);
    return { phase: "db", cursor: inner || null };
  }

  if (raw.startsWith("p.")) {
    const [topic, page] = raw.slice(2).split(".").map(Number);
    if (Number.isFinite(topic) && Number.isFinite(page)) {
      return { phase: "pixabay", topic, page };
    }
  }

  // Anything unparseable (a hand-edited URL, an old cursor) restarts cleanly
  // rather than throwing at the user.
  return { phase: "db", cursor: null };
}

/** Where to go after the database is used up. */
const startOfPixabay = (): string | null =>
  isPixabayConfigured() ? encode({ phase: "pixabay", topic: 0, page: 1 }) : null;

export async function getFeedPage(
  cursor?: string | null,
  limit = 30,
): Promise<FeedPage> {
  const position = decode(cursor);

  if (position.phase === "db") {
    const page = await listPins({ limit, cursor: position.cursor });

    return {
      items: page.pins.map((pin) => ({ kind: "pin", id: `pin:${pin.id}`, pin })),
      // The handover: no more pins → hop to Pixabay rather than reporting the end.
      nextCursor: page.nextCursor
        ? encode({ phase: "db", cursor: page.nextCursor })
        : startOfPixabay(),
    };
  }

  const topic = TOPICS[position.topic];
  if (!topic) return { items: [], nextCursor: null }; // Genuinely the end.

  try {
    const { images } = await searchImages({
      query: topic,
      page: position.page,
      perPage: limit,
    });

    // A topic runs dry either by returning nothing or by hitting Pixabay's cap.
    const exhausted = images.length === 0 || position.page >= MAX_PIXABAY_PAGES;
    const next: Position = exhausted
      ? { phase: "pixabay", topic: position.topic + 1, page: 1 }
      : { phase: "pixabay", topic: position.topic, page: position.page + 1 };

    // Skipping a dry topic shouldn't hand back an empty page — recurse once into
    // the next topic so the scroller always gets something to render.
    if (images.length === 0) {
      return position.topic + 1 < TOPICS.length
        ? getFeedPage(encode(next), limit)
        : { items: [], nextCursor: null };
    }

    return {
      items: images.map((image) => ({
        kind: "result",
        id: `px:${image.providerId}`,
        image,
      })),
      nextCursor: TOPICS[next.topic] ? encode(next) : null,
    };
  } catch {
    // Rate-limited, or Pixabay is down. Stop the feed politely instead of
    // showing an error on a page the user is merely scrolling through.
    return { items: [], nextCursor: null };
  }
}
