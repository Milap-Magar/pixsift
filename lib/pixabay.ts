// ── Pixabay search ──────────────────────────────────────────────────────────
//
// Discovery comes from Pixabay; only what a user SAVES ever reaches our database.
// That's the right split — we never warehouse an image catalogue we don't own.
//
// Three rules from Pixabay's API terms shape this file:
//   1. Requests must be cached for 24 hours. `revalidate: 86400` does that in
//      Next's data cache, so a hundred users searching "mountain" cost one call.
//   2. ~100 requests / 60s per key. The cache is what keeps us under it; a 429
//      is surfaced as a clean error rather than a crash.
//   3. PERMANENT hotlinking of their URLs isn't allowed — images you keep
//      displaying are meant to be copied to your own storage. So the URLs below
//      are fine for rendering live search results, but a *saved* pin should be
//      mirrored to Cloudinary (see lib/cloudinary.ts) rather than pointing at
//      pixabay.com forever.
//
// The key is server-only. It must never be prefixed NEXT_PUBLIC_ — that would
// ship it to every browser, and anyone could burn your rate limit.

const ENDPOINT = "https://pixabay.com/api/";

/** 24 hours, in seconds — Pixabay's required cache window. */
const CACHE_SECONDS = 86_400;

export const isPixabayConfigured = () => Boolean(process.env.PIXABAY_API_KEY);

/**
 * One search result, normalised into the shape the rest of the app speaks.
 *
 * Pixabay has no title or description field — `tags` is the only text it gives
 * you. That's actually good news for the recommender: tags are a cleaner signal
 * than prose, and they're what lib/recommend can segment on.
 */
export type PixabayImage = {
  providerId: string;
  title: string;
  description: string;
  tags: string[];
  /** Small (~150px) — for grids and hover previews. */
  thumbUrl: string;
  /** ~640px on the long edge — what you'd actually render. */
  imageUrl: string;
  /** Full size — what to mirror into Cloudinary when a user saves. */
  largeUrl: string;
  width: number;
  height: number;
  /** The Pixabay page. Worth linking: attribution isn't required, but it's decent. */
  pageUrl: string;
  credit: { name: string };
};

type PixabayHit = {
  id: number;
  pageURL: string;
  tags: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
};

export type SearchOptions = {
  query: string;
  page?: number;
  perPage?: number;
};

export type SearchResult = {
  images: PixabayImage[];
  /** How many Pixabay will actually page through (not the same as `total`). */
  totalHits: number;
};

/** "yellow flowers, meadow, summer" → a real title and a tag list. */
function normalise(hit: PixabayHit): PixabayImage {
  // Pixabay repeats tags — a real result comes back as "hallstatt, austria,
  // …, austria, austria". Left alone, the duplicates would inflate the
  // tag-overlap score in findByTags() and make one popular keyword dominate.
  const tags = [
    ...new Set(
      hit.tags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const title = tags[0] ? tags[0][0].toUpperCase() + tags[0].slice(1) : "Untitled";

  return {
    providerId: String(hit.id),
    title,
    // Reads like a caption and, more usefully, gives content-based filtering
    // the same vocabulary the seed descriptions have.
    description: tags.join(", "),
    tags,
    thumbUrl: hit.previewURL,
    imageUrl: hit.webformatURL,
    largeUrl: hit.largeImageURL,
    width: hit.imageWidth,
    height: hit.imageHeight,
    pageUrl: hit.pageURL,
    credit: { name: hit.user },
  };
}

export class PixabayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PixabayError";
  }
}

/** Every call goes through here, so the caching and the error shape stay in one place. */
async function request(params: URLSearchParams): Promise<{ totalHits: number; hits: PixabayHit[] }> {
  const response = await fetch(`${ENDPOINT}?${params}`, {
    // The cache key includes the full URL — so it's per query AND per page,
    // which is exactly the granularity Pixabay's 24h rule wants.
    next: { revalidate: CACHE_SECONDS },
  });

  if (response.status === 429) {
    throw new PixabayError("Pixabay rate limit hit — try again in a minute.", 429);
  }
  if (!response.ok) {
    // Pixabay returns its complaint as plain text (e.g. "[ERROR 400] Invalid key").
    const detail = await response.text().catch(() => "");
    throw new PixabayError(detail.trim() || `Pixabay returned ${response.status}`, response.status);
  }

  return (await response.json()) as { totalHits: number; hits: PixabayHit[] };
}

function apiKey(): string {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new PixabayError("PIXABAY_API_KEY is not set in .env", 503);
  return key;
}

export async function searchImages({
  query,
  page = 1,
  perPage = 24,
}: SearchOptions): Promise<SearchResult> {
  const key = apiKey();

  const q = query.trim();
  if (!q) return { images: [], totalHits: 0 };

  const params = new URLSearchParams({
    key,
    q,
    image_type: "photo",
    safesearch: "true",
    order: "popular",
    // Pixabay caps per_page at 200 and rejects anything under 3.
    per_page: String(Math.min(Math.max(perPage, 3), 200)),
    page: String(Math.max(page, 1)),
  });

  const data = await request(params);

  return {
    images: data.hits.map(normalise),
    totalHits: data.totalHits,
  };
}

/**
 * One image by its Pixabay id — what the detail page at /photo/[id] renders.
 *
 * There is no `/images/{id}` endpoint. Passing `id` to the SAME search endpoint
 * is how Pixabay does single lookups, and it hands back the identical hit shape.
 * An id that has been deleted (or never existed) comes back as an empty `hits`
 * array with HTTP 200 — not a 404 — so `null` here means "no such image", and
 * the page turns that into notFound().
 *
 * Cached for 24h like every other call, so a shared link that gets opened fifty
 * times costs one request.
 */
export async function getImageById(id: string): Promise<PixabayImage | null> {
  const key = apiKey();

  // Pixabay ids are plain integers. Anything else is a hand-edited URL, and
  // there's no reason to spend a rate-limit slot discovering that.
  if (!/^\d+$/.test(id)) return null;

  const data = await request(new URLSearchParams({ key, id }));
  const hit = data.hits[0];

  return hit ? normalise(hit) : null;
}
