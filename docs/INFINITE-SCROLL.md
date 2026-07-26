# Infinite scroll, and the API behind it

An endless feed is four cooperating pieces: a **paged database query**, an **API
route** that exposes it, a **client hook** that fetches the next page, and a
**sentinel** element that decides when. This document walks all four as they exist
in this repo, then shows you how to add one to a new page.

The interesting part isn't the scrolling — `IntersectionObserver` is twenty lines.
It's the paging. Get that wrong and users see duplicates, miss items, and the
query gets slower the further they scroll. That's where we'll spend most of the
time.

---

## Table of contents

1. [The whole loop in one picture](#1-the-whole-loop-in-one-picture)
2. [Why `?page=2` is broken (and what to do instead)](#2-why-page2-is-broken-and-what-to-do-instead)
3. [Cursors: the design](#3-cursors-the-design)
4. [The query, and the index that makes it fast](#4-the-query-and-the-index-that-makes-it-fast)
5. [The API route](#5-the-api-route)
6. [Caching — and the trap privacy sets](#6-caching--and-the-trap-privacy-sets)
7. [The client hook, line by line](#7-the-client-hook-line-by-line)
8. [The sentinel and the status strip](#8-the-sentinel-and-the-status-strip)
9. [Advanced: one cursor over two data sources](#9-advanced-one-cursor-over-two-data-sources)
10. [Recipe: add an infinite list to a new page](#10-recipe-add-an-infinite-list-to-a-new-page)
11. [Verify it yourself](#11-verify-it-yourself)
12. [Bugs everyone writes once](#12-bugs-everyone-writes-once)
13. [When not to use infinite scroll](#13-when-not-to-use-infinite-scroll)
14. [Exercises](#14-exercises)

---

## 1. The whole loop in one picture

```
  ┌─ SERVER (first page, in the HTML) ──────────────────────────────┐
  │  app/page.tsx                                                   │
  │    const { items, nextCursor } = await getFeedPage(null, 30)     │
  │    <InfiniteFeed initialItems={items} initialCursor={…} />       │
  └─────────────────────────────────────────────────────────────────┘
                              │  user scrolls
                              ▼
  ┌─ CLIENT ────────────────────────────────────────────────────────┐
  │  use-infinite-list.ts                                           │
  │    IntersectionObserver sees the sentinel 800px early            │
  │    fetch(`/api/feed?cursor=<opaque>&limit=30`)                  │
  └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─ API ROUTE ─────────────────────────────────────────────────────┐
  │  app/api/feed/route.ts  →  lib/feed.ts  →  lib/db/pins.ts       │
  │    returns { items, nextCursor }                                │
  └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              append (de-duped) → set cursor → repeat
                  nextCursor === null → done
```

Two decisions in that diagram are worth naming, because they're the ones people
skip:

**The first page is rendered on the server.** The wall is in the initial HTML, so
it appears with no JavaScript at all and there's no spinner on first paint. Only
page 2 onwards involves `fetch`.

**One value drives everything: `nextCursor`.** It's the pointer to the next page and
the end-of-list flag in one (`null` = finished), so the client holds a single piece
of state and can't get into a "loading page 5 of 4" mess.

---

## 2. Why `?page=2` is broken (and what to do instead)

The obvious API is `GET /api/pins?page=2&limit=30` → `.skip(30).limit(30)`. It has
two independent problems.

### Problem 1: it's wrong when the data changes

You're looking at page 1 (items 1–30, newest first). Someone uploads a photo. You
scroll; the client asks for page 2 = items 31–60. But everything shifted down one:

```
     before the upload            after the upload
 1.  Harbour lights          1.  NEW PHOTO
 …                           2.  Harbour lights
30.  Misty morning           …
─── page 2 ───               31.  Misty morning      ← you already saw this
31.  Quiet street            32.  Quiet street
```

`Misty morning` appears twice. Delete an item instead and something is skipped
entirely, silently. React will warn about the duplicate key, which is how most
people discover this bug — from a console warning, in production.

### Problem 2: it gets slower as you scroll

`.skip(3000)` doesn't jump. The database walks and discards 3,000 entries before
returning anything, so page 100 costs a hundred times page 1. Users who scroll the
furthest — your most engaged users — get the slowest experience.

### The fix: keyset paging

Ask **"what comes after the last thing I saw?"** instead of "what's at offset N?".

```ts
// Not: .skip(30).limit(30)
// But: everything strictly older than the last row of the previous page
{ createdAt: { $lt: lastSeenCreatedAt } }
```

Inserts and deletes elsewhere in the list can no longer shift your window, because
the window is defined by a value in the data rather than by a count. And the
database can seek straight to that value in an index, so page 100 costs the same as
page 1.

The catch, and it's a real one: **you can't jump to page 50.** Keyset paging only
walks forward. For a feed, that's exactly what you want. For a table with numbered
pages, it isn't — see §13.

---

## 3. Cursors: the design

A cursor is "the last row you saw". Two rules make it robust:

**Include a tie-breaker.** Two pins can share a `createdAt` (the seed script writes
several in one go). Paging on the timestamp alone either drops or repeats them, so
the cursor carries `_id` too and the condition becomes:

```ts
// lib/db/pins.ts
$or: [
  { createdAt: { $lt: position.createdAt } },                      // strictly older
  { createdAt: position.createdAt, _id: { $lt: position.id } },     // same instant, smaller id
]
```

Read it as: *everything older, plus the same-timestamp rows we haven't reached yet.*
The sort must match exactly — `{ createdAt: -1, _id: -1 }` — or the "haven't
reached yet" half is a lie.

**Make it opaque.** `lib/db/pins.ts` base64url-encodes `"<createdAt>.<id>"`:

```ts
const encodeCursor = (pin: SavedPin): string =>
  Buffer.from(`${pin.createdAt}.${pin.id}`).toString("base64url");
```

This is not security — anyone can decode base64. It's an **interface** decision.
An opaque token tells callers "don't build one of these yourself", which leaves you
free to change what's inside later. §9 is that freedom being spent: the same
`cursor` parameter later means "Pixabay topic 3, page 7", and no client needed to
change.

Two details worth stealing:

- **`decodeCursor` returns `null` for anything unparseable**, and the caller then
  behaves as if no cursor was given. A stale or hand-edited cursor restarts the
  list instead of throwing a 500 at someone who was only scrolling.
- **`limit + 1`** is fetched, and if the extra row comes back there's another page.
  No `count()` query — which on a large collection would cost more than the page
  itself.

```ts
const docs = await pins.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();

const hasMore = docs.length > limit;
const page = (hasMore ? docs.slice(0, limit) : docs).map(toPin);

return { pins: page, nextCursor: hasMore && page.length ? encodeCursor(page.at(-1)!) : null };
```

---

## 4. The query, and the index that makes it fast

Keyset paging is only fast if an index matches the sort. The rule for a compound
index is **equality → sort → range**:

```ts
// lib/db/pins.ts
{ key: { visibility: 1, createdAt: -1, _id: -1 }, name: "feed_public_newest" }
```

`visibility` is an equality match (`"public"`), so it leads; then the two sort keys
in the order and direction the query asks for. MongoDB seeks to the public block
and walks it, stopping after `limit + 1` keys. It never loads-then-sorts, which
matters beyond speed: an in-memory sort has a 32MB ceiling and fails outright when
the collection outgrows it.

Put `createdAt` first instead and every private row has to be scanned and thrown
away. Same data, same results, quietly worse plan.

You don't have to take this on faith — `bun run db:check` prints the plan:

```
✓ feed: newest 24
    plan          IXSCAN (feed_newest)
    examined      14 keys / 14 docs → 14 returned
    sorted in RAM no
```

Three numbers to read every time you change a query:

- **`IXSCAN`, not `COLLSCAN`.** A collection scan means no index is being used.
- **`sorted in RAM: no`.** A `SORT` stage means the index didn't match the sort.
- **`examined ≈ returned`.** Examining 10,000 keys to return 24 means the filter
  isn't in the index and the server is discarding rows after reading them.

---

## 5. The API route

The route is thin on purpose — parse, delegate, respond:

```ts
// app/api/feed/route.ts
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limitParam = Number(params.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 30;

  try {
    const page = await getFeedPage(params.get("cursor"), limit);
    return Response.json(page, { headers: { "Cache-Control": "public, s-maxage=30, …" } });
  } catch (error) {
    console.error("GET /api/feed failed:", error);
    return Response.json({ error: "Failed to load the feed." }, { status: 500 });
  }
}
```

Four things that aren't accidents:

**`Math.min(limitParam, 50)`.** `limit` arrives from the URL, so someone will try
`?limit=100000`. That's not malice, it's Tuesday. Every paged endpoint needs a
ceiling; `listPins` clamps again at `MAX_LIMIT` because defence in depth is cheap
when it's one `Math.min`.

**`Number.isFinite`.** `Number("abc")` is `NaN`, and `NaN > 0` is `false`, so the
default applies. Without the guard, `NaN` reaching `.limit()` is a driver error.

**The response shape is `{ items, nextCursor }`** — the same shape whatever the
source. That's what lets one hook serve every list in the app.

**Errors return a 500 with a message, and log the real one.** The client shows
"Try again" and keeps its cursor, so a blip costs a tap rather than the whole
session.

---

## 6. Caching — and the trap privacy sets

```ts
"Cache-Control": "public, s-maxage=30, stale-while-revalidate=300"
```

- `public` — a shared cache (CDN, proxy) may store this response.
- `s-maxage=30` — fresh for 30 seconds for shared caches.
- `stale-while-revalidate=300` — for the next 5 minutes, serve the stale copy
  *immediately* and refresh behind it. Nobody waits for the refresh.

For a public feed this is close to free performance. But it's also a loaded gun,
and this repo has the scar to prove it: **pins can be private.**

A cache key is (roughly) the URL. If `/api/feed?cursor=X` returned *your* pins
because you were signed in, the CDN would store that under a viewer-agnostic key
and hand it to the next person who asked. One user's private photo, in a stranger's
feed, and nothing in your code looks wrong.

Two defences, both in this repo:

**Make the cacheable endpoint viewer-independent.** `lib/feed.ts` calls `listPins`
*without* a `viewerId`, so the feed is public pins only — not even your own private
ones. It says so in a comment, because the next person to touch it will be tempted
to "fix" that.

**Or vary the header with the viewer.** `app/api/dashboard/route.ts` does the other
thing: signed in, it includes your private pins *and* switches to
`Cache-Control: private, no-store`.

```ts
const user = await currentUser();

const cacheHeaders = user
  ? { "Cache-Control": "private, no-store" }
  : { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" };
```

The rule to carry away: **a response's cache header and the identity it depends on
must be decided in the same breath.** Any endpoint that reads the session and is
also `public`-cacheable is a bug waiting for traffic.

---

## 7. The client hook, line by line

[`app/components/use-infinite-list.ts`](../app/components/use-infinite-list.ts) is
generic over the item type — the feed and the pin grid differ only in which
endpoint they call and how they unwrap the response, so those are the parameters.

```ts
const { items, loading, error, done, loadMore, sentinel } = useInfiniteList<FeedItem>({
  initialItems,          // rendered by the server — page 1
  initialCursor,         // null means "the server already sent everything"
  endpoint: "/api/feed",
  select: selectFeed,    // (payload) => { items, nextCursor }
  getKey: keyOf,         // stable id per item
});
```

### The guard that isn't state

```ts
const loadingRef = useRef(false);

const loadMore = useCallback(async () => {
  if (loadingRef.current || !cursor) return;
  loadingRef.current = true;
  …
```

Why a ref and not the `loading` state? Because state updates are asynchronous. Two
observer callbacks can fire in the same tick — a fast scroll does this routinely —
and the second would read a `loading` that hasn't been updated yet, firing a
duplicate request. A ref is written and read synchronously, so the second call
returns immediately. `loading` state still exists, but only for the UI.

### De-duplication as a safety net

```ts
setItems((current) => {
  const seen = new Set(current.map(getKey));
  return [...current, ...page.items.filter((item) => !seen.has(getKey(item)))];
});
```

Keyset paging shouldn't produce duplicates — but the second half of this feed is
Pixabay, and the same photo legitimately appears under two topics. Without this
filter React warns about duplicate keys and renders the same photo twice. It's
five lines that make the whole system tolerant of imperfect sources.

### Errors keep the cursor

```ts
} catch (cause) {
  setError(cause instanceof Error ? cause.message : "Could not load more.");
}
```

Note what *doesn't* happen: the cursor isn't cleared. "Try again" resumes from the
same place instead of restarting the feed. Losing someone's scroll position after
one flaky request is a much bigger failure than the request itself.

### The `select` warning is real

```ts
// IMPORTANT for callers: pass a `select` defined at MODULE scope, not inline.
const selectFeed = (payload: unknown) => payload as { items: FeedItem[]; nextCursor: string | null };
```

`select` and `getKey` are in `loadMore`'s dependency array, and `loadMore` is in the
observer's effect dependencies. An inline arrow is a new function identity on every
render → new `loadMore` → the effect tears down and rebuilds the observer on every
render. It still *works*, which is why this bug survives code review; it just does
a lot of pointless work. Module scope makes the identity stable forever.

---

## 8. The sentinel and the status strip

```ts
useEffect(() => {
  const target = sentinel.current;
  if (!target) return;

  const observer = new IntersectionObserver(
    ([entry]) => { if (entry.isIntersecting) void loadMore(); },
    { rootMargin: "800px 0px" },
  );

  observer.observe(target);
  return () => observer.disconnect();
}, [loadMore]);
```

**`rootMargin: "800px 0px"`** inflates the viewport by 800px vertically, so the
sentinel "intersects" while it's still that far below the fold. The next page is
usually already rendered when the user gets there, which is the difference between
an endless feed and a feed with a spinner in it. Tune it up for slow APIs, down to
save bandwidth.

**Re-registering per cursor is deliberate.** `loadMore` changes identity when the
cursor changes, so the effect re-runs once per page. That's the fix for a tall
screen and a short page: if the sentinel is *still* visible after a page lands, the
fresh observer fires again and keeps filling the viewport. A single
never-recreated observer would stall, because `isIntersecting` doesn't re-fire while
it stays true.

**`observer.disconnect()`** on cleanup. Without it, every re-render leaks an
observer holding a reference to a stale closure.

The sentinel itself lives in
[`infinite-status.tsx`](../app/components/infinite-status.tsx), and two details
there are easy to miss:

```tsx
<div ref={sentinel} aria-hidden className="h-px" />
```

It's kept **outside** the masonry wall — inside a `columns-*` container it would be
flowed as a column item and could end up somewhere surprising (see
[`MASONRY.md`](./MASONRY.md)). And it's `aria-hidden`, because it's a scroll
trigger, not content.

```tsx
<div aria-live="polite">
  {error ? … : loading ? "Loading more…" : done ? doneLabel : <button onClick={onRetry}>Load more</button>}
</div>
```

- **`aria-live="polite"`** announces "Loading more…" to screen readers. Content
  appearing silently is disorienting.
- **The "Load more" button is a real fallback, not decoration.** If
  `IntersectionObserver` never fires — data-saver mode, an unusual browser, a
  viewport taller than your `rootMargin` — the list still works by tapping. This is
  also the accessible path for anyone who doesn't scroll with a mouse wheel.

---

## 9. Advanced: one cursor over two data sources

[`lib/feed.ts`](../lib/feed.ts) is worth reading once you've got the basics,
because it does something the client can't detect: the home feed plays every pin in
MongoDB, then keeps going with live Pixabay results — through **one** cursor.

```
d.<createdAt>.<id>    still walking the database (keyset paging)
p.<topic>.<page>      into Pixabay: topic N of TOPICS, page P
```

Both encode to one opaque base64url string, so `/api/feed` has one `cursor`
parameter and `useInfiniteList` never knows a handover happened. The transition is
literally this line:

```ts
nextCursor: page.nextCursor
  ? encode({ phase: "db", cursor: page.nextCursor })
  : startOfPixabay(),          // ← out of pins? hop to Pixabay instead of ending
```

Two touches worth stealing:

- **A dry topic recurses once** into the next topic rather than returning an empty
  page, because an empty page would stall the observer (nothing new renders, so
  nothing moves the sentinel).
- **A Pixabay outage ends the feed politely** (`{ items: [], nextCursor: null }`)
  instead of throwing an error onto a page someone was idly scrolling.

This is what §3's "make the cursor opaque" buys. The client contract never changed.

---

## 10. Recipe: add an infinite list to a new page

Say you want `/author/[id]` to page one person's pins.

**1. The query already exists.** `listPins` takes `authorId`:

```ts
const page = await listPins({ authorId, viewerId: user?.id, limit: 30, cursor: null });
```

**2. So does the endpoint.** `/api/dashboard?author=<id>` — check before adding
one; a second endpoint with the same job is a second thing to keep correct.

**3. Render the first page on the server:**

```tsx
// app/author/[id]/page.tsx
export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const page = await listPins({ authorId: id, viewerId: user?.id, limit: 30 });

  return (
    <InfinitePinGrid
      initialPins={page.pins}
      initialCursor={page.nextCursor}
      endpoint={`/api/dashboard?author=${encodeURIComponent(id)}`}
      favoriteIds={user ? [...getFavoriteIds(user.id)] : []}
      signedIn={Boolean(user)}
      empty={<p>No pins yet.</p>}
    />
  );
}
```

**4. That's it** — [`InfinitePinGrid`](../app/components/infinite-pin-grid.tsx)
wires the hook, the wall and the status strip.

Two things to check before you call it done:

- **Does an index cover the new filter?** `authorId` + the sort keys →
  `by_author_newest`. Run `bun run db:check`. A new filter without an index is the
  most common way a fast feed becomes a slow one.
- **Match `pageSize` to the server's first page.** Server 30, client 30. Mismatched
  sizes make the scroll rhythm lurch, and off-by-one bugs harder to spot.

Note that the hook appends `?cursor=…&limit=…` with `URLSearchParams`, so an
endpoint that already has a query string (`?author=…`) works fine.

---

## 11. Verify it yourself

Paging is easy to *believe* is working. These commands check. (Run them against
`bun run dev`; they're written for a POSIX shell — on Windows, Git Bash.)

```bash
# 1. One page, and its cursor.
curl -s 'http://localhost:3000/api/pins?limit=3' | head -c 300

# 2. Follow the cursor: page 2 must not repeat page 1.
C=$(curl -s 'http://localhost:3000/api/pins?limit=3' \
      | grep -o '"nextCursor":"[^"]*"' | cut -d'"' -f4)
curl -s "http://localhost:3000/api/pins?limit=3&cursor=$C" | grep -o '"id":"[^"]*"'
```

Page 1 gives ids `14, 13, 12` on a freshly seeded database and page 2 gives
`11, 10, 9`. Two runs, six distinct ids, no overlap — that's keyset paging working.
Repeat it after inserting a pin: still no overlap, which is the property `.skip()`
would have lost.

```bash
# 3. A garbage cursor must restart cleanly (200), never 500.
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/pins?cursor=notacursor'

# 4. A hostile limit must not be honoured.
curl -s 'http://localhost:3000/api/feed?limit=100000' | grep -o '"kind"' | wc -l
```

With the 14-pin starter dataset, #4 returns 14 — the collection is smaller than any
limit, so the clamp isn't *visible* here. It's in `Math.min(limitParam, 50)` in the
route and `MAX_LIMIT` in `listPins`, and it becomes load-bearing the moment the
collection is bigger than the ceiling. If you want to watch it work, seed a few
hundred rows and re-run: the count stops at the ceiling, not at your number.

Then `bun run db:check` for the query plan (§4), and in the browser: open the
Network panel, scroll, and watch one request fire per page with a different
`cursor` each time. Two requests with the *same* cursor means the `loadingRef`
guard isn't holding.

Then `bun run db:check` for the query plan (§4), and in the browser: open the
Network panel, scroll, and watch one request fire per page with a different
`cursor` each time. Two requests with the *same* cursor means the `loadingRef`
guard isn't holding.

One more, for the privacy rule in §6 — a signed-out request must never contain a
private pin:

```bash
curl -s 'http://localhost:3000/api/pins?limit=100' | grep -c '"visibility":"private"'   # → 0
```

---

## 12. Bugs everyone writes once

1. **`.skip(n)` paging.** Duplicates and skips when data changes; slower the deeper
   you go. §2.
2. **A cursor with no tie-breaker.** Items sharing a timestamp get dropped or
   repeated. §3.
3. **A sort that doesn't match the index.** Silent `COLLSCAN` + in-memory sort. §4.
4. **`loading` state as the re-entrancy guard.** Async state updates let two
   fetches through. Use a ref. §7.
5. **An inline `select`/`getKey`.** Rebuilds the observer every render. §7.
6. **No de-dupe on append.** React key warnings, repeated tiles. §7.
7. **Clearing the cursor on error.** One flaky request nukes the session. §7.
8. **No limit ceiling.** `?limit=100000` becomes a denial-of-service you built. §5.
9. **`public` cache on a viewer-specific response.** Private data served to
   strangers. §6.
10. **No non-scroll fallback.** Nothing loads if `IntersectionObserver` never
    fires. §8.
11. **Appending inside the masonry container.** The sentinel gets flowed as a
    column item and stops behaving. §8.
12. **Assuming the observer re-fires while `isIntersecting` stays true.** It
    doesn't — re-register per page. §8.

---

## 13. When not to use infinite scroll

It's a genuine trade, not a free upgrade:

- **You can't link to "the middle".** Someone scrolling for ten minutes can't
  share where they are. Numbered pages are URLs; a scroll position isn't.
- **The footer becomes unreachable.** If anything important lives down there,
  either move it or use "Load more".
- **Back-navigation loses the position** unless you restore it (the pages are in
  memory, not in the URL).
- **Crawlers only see page 1**, since they don't scroll. If those items need to be
  indexed, they need real links from somewhere.
- **Numbered data wants numbers.** A table you audit, reconcile or cite by row —
  offset paging is the right tool, and its weaknesses matter less than being able
  to say "page 7".

A good middle path: infinite scroll with a real "Load more" button as the fallback
(what this app does), plus a paginated route for anything that needs addressing.

---

## 14. Exercises

1. **Break paging on purpose.** Change the sort in `listPins` to
   `{ createdAt: -1 }` (drop `_id`), seed several pins with the same timestamp, and
   page through. Watch the duplicate/skip bug in the wild, then run `db:check` and
   see the plan change too.
2. **Feel `rootMargin`.** Set it to `0px`, scroll, and notice the spinner you never
   normally see. Then `2000px` and watch the Network panel prefetch ahead.
3. **Delete the de-dupe filter** and scroll deep into the Pixabay half until React
   warns about a duplicate key. Now you know what that warning means.
4. **Trigger the retry path.** Stop the dev server mid-scroll, hit "Try again",
   restart it, and confirm the feed resumes from the same cursor rather than the
   top.
5. **Add scroll restoration.** Store the loaded pages (and scroll offset) in
   `sessionStorage`, keyed by pathname, and restore on mount. Think about what
   should happen when the data has changed underneath.
6. **Add a `?since=` filter** ("pins from this week") to `listPins` and the route,
   and work out which index serves it. Does `feed_public_newest` still apply? Prove
   it with `db:check`.
7. **Read [`lib/feed.ts`](../lib/feed.ts) properly**, then add a third phase to the
   cursor (say, a second provider). If you can do that without touching
   `use-infinite-list.ts`, the abstraction was worth it.
