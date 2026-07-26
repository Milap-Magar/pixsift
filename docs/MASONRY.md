# Masonry layouts with CSS and Tailwind

How the Pinterest-style wall in this app works, the three other ways to build one,
and how to pick. Every code sample here is either lifted from this repo or
drop-in for it.

---

## Table of contents

1. [What "masonry" actually means](#1-what-masonry-actually-means)
2. [The one this repo uses: CSS multi-column](#2-the-one-this-repo-uses-css-multi-column)
3. [The catch you must decide about: reading order](#3-the-catch-you-must-decide-about-reading-order)
4. [Approach 2 — CSS Grid with row spans (order preserved)](#4-approach-2--css-grid-with-row-spans-order-preserved)
5. [Approach 3 — flex columns you fill yourself](#5-approach-3--flex-columns-you-fill-yourself)
6. [Approach 4 — JavaScript positioning, and why it's last](#6-approach-4--javascript-positioning-and-why-its-last)
7. [Native CSS masonry](#7-native-css-masonry)
8. [Making the images behave](#8-making-the-images-behave)
9. [Choosing column counts](#9-choosing-column-counts)
10. [Debugging checklist](#10-debugging-checklist)
11. [Exercises](#11-exercises)

---

## 1. What "masonry" actually means

Tiles of **equal width** and **varying height**, packed so there are no gaps —
each new tile drops into the shortest column, like bricks.

```
 ┌────┐┌────┐┌────┐        Columns are equal width.
 │    ││    ││    │        Heights vary with the image.
 │    │└────┘│    │        Nothing is stretched or cropped to fit a cell.
 └────┘┌────┐└────┘
 ┌────┐│    │┌────┐
 │    ││    ││    │
```

That last line is the point. A normal CSS grid gives you a **rigid lattice**: every
row is as tall as its tallest cell, so a portrait photo next to a landscape one
either leaves whitespace or gets cropped. Masonry throws away the row concept
entirely — that's the trade you're making, and as we'll see, rows are also what
carry left-to-right reading order.

---

## 2. The one this repo uses: CSS multi-column

Two utilities and you're done. From
[`app/components/pin-grid.tsx`](../app/components/pin-grid.tsx):

```tsx
<div className="columns-2 gap-4 *:mb-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
  {pins.map((pin) => (
    <PinCard key={pin.id} pin={pin} /* … */ />
  ))}
</div>
```

and on each tile, in [`pin-card.tsx`](../app/components/pin-card.tsx):

```tsx
<figure className="group relative isolate break-inside-avoid overflow-hidden rounded-2xl …">
```

Four things are doing work there, and three of them are non-obvious:

**`columns-3`** → `column-count: 3`. The browser flows the children into three
vertical columns, balancing their total height. This is a text-layout feature from
2011 that happens to be a perfect masonry engine, and it needs no JavaScript at
all. It's why the wall renders correctly in the very first HTML response, before
any script loads.

**`gap-4`** → `gap: 1rem`, which for multi-column means `column-gap` — the
_horizontal_ space between columns. It does **nothing** vertically.

**`*:mb-4`** is therefore not decoration: it's `margin-bottom` on every direct
child, and it's the only thing separating tiles _within_ a column. (`*:` is
Tailwind's child selector — `> * { margin-bottom: 1rem }`.) Miss it and your
columns are correct with the tiles fused into one strip.

**`break-inside-avoid`** → `break-inside: avoid`. Without it the browser treats
each card the way it treats a paragraph: something it may split across a column
boundary. You get the top half of a photo at the bottom of column 2 and the
caption at the top of column 3. Nothing else in CSS produces quite that effect, so
it's an easy symptom to recognise.

While you're in `pin-card.tsx`, read the comment about `isolate`. It's unrelated
to masonry but it's the same category of bug: the favourite button's `z-10` escapes
the card and competes with the sticky header, because `position: relative` with
`z-index: auto` does not create a stacking context. `isolate` (→ `isolation:
isolate`) scopes every z-index inside the card to the card.

### What you get for free

- No layout JavaScript. Server-rendered, correct on first paint, no reflow flash.
- Reflows on window resize, font size change and image load, for free.
- Works everywhere. `column-count` support is universal and has been for a decade.

---

## 3. The catch you must decide about: reading order

Multi-column fills **column by column**, not row by row. With nine tiles:

```
   what you get              what a row-major grid gives
   ┌───┬───┬───┐             ┌───┬───┬───┐
   │ 1 │ 4 │ 7 │             │ 1 │ 2 │ 3 │
   │ 2 │ 5 │ 8 │             │ 4 │ 5 │ 6 │
   │ 3 │ 6 │ 9 │             │ 7 │ 8 │ 9 │
   └───┴───┴───┘             └───┴───┴───┘
```

So on a six-column screen, the newest pin is top-left and the _seventh_-newest is
top-right — the top row is not "the six newest".

**When that's fine** (and it's why this app accepts it): a discovery wall you
scan rather than read. Nobody looks at Pinterest and infers a strict ordering. The
first thing you see is still the newest thing.

**When it's not:** search results, leaderboards, anything numbered, anything
where "first" means something. `/most-popular` in this app renders `#1 · 42 saves`
_in each caption_ precisely because the visual position can't carry the rank.
That's a reasonable fix; the other one is the next section.

The DOM order is unchanged either way, so keyboard and screen-reader users always
traverse in true order. It's only the visual arrangement that's column-major.

---

## 4. Approach 2 — CSS Grid with row spans (order preserved)

If you need row-major order _and_ ragged heights, use a grid with very short rows
and let each tile span as many as it needs.

The trick: `grid-auto-rows: 8px` plus `grid-row-end: span N`, where `N` comes from
the image's aspect ratio. This app already stores `width` and `height` on every
pin (see `PinDoc` in [`lib/db/pins.ts`](../lib/db/pins.ts)), so you can compute
`N` on the server — no measuring, no layout pass, no flicker:

```tsx
// A drop-in alternative to PinGrid. Row-major order, ragged heights.
const ROW = 8;   // px per grid row — smaller = finer packing, more rows to lay out
const GAP = 16;  // must match gap-4

function span(pin: Pin, columnWidth = 300): number {
  // No dimensions stored? Fall back to a portrait-ish guess.
  const ratio = pin.width && pin.height ? pin.height / pin.width : 1.4;
  const captionHeight = 64;
  return Math.ceil((columnWidth * ratio + captionHeight + GAP) / ROW);
}

<div
  className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
  style={{ gridAutoRows: `${ROW}px` }}
>
  {pins.map((pin) => (
    <div key={pin.id} style={{ gridRowEnd: `span ${span(pin)}` }}>
      <PinCard pin={pin} /* … */ />
    </div>
  ))}
</div>
```

| | |
| --- | --- |
| ✅ | True left-to-right, top-to-bottom order. |
| ✅ | Still zero JavaScript, still server-renderable. |
| ✅ | Real `gap` in both directions — no `*:mb-4` needed. |
| ❌ | You must know each item's aspect ratio, or measure it. |
| ❌ | The span is an *estimate*: get `captionHeight` wrong and gaps creep in. |
| ❌ | Not true masonry — a tile can't slide up into a neighbouring column's gap, so the bottom edge is raggeder than multi-column's. |

Rule of thumb: **known dimensions + order matters → grid spans. Unknown
dimensions or order doesn't matter → multi-column.**

---

## 5. Approach 3 — flex columns you fill yourself

Render N explicit columns and distribute items into them in JavaScript (or on the
server — it's just arithmetic):

```tsx
const columns: Pin[][] = Array.from({ length: 4 }, () => []);
pins.forEach((pin, i) => columns[i % 4].push(pin));   // round-robin

<div className="flex gap-4">
  {columns.map((column, i) => (
    <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
      {column.map((pin) => <PinCard key={pin.id} pin={pin} /* … */ />)}
    </div>
  ))}
</div>
```

This is what [`photo-wall.tsx`](../app/components/photo-wall.tsx) does for the
animated wall behind the login dialog — and there the reason is specific: each
column is independently animated (alternating up/down marquees at different
speeds), which multi-column simply cannot express, because you don't get elements
for the columns to animate.

Note also its comment about using `mb-3` on the tiles rather than flex `gap`: each
column holds its tiles **twice** so that translating by `-50%` loops seamlessly,
and that only works if the two halves are exactly equal height. `gap` adds space
*between* items but not after the last one, which breaks the symmetry. Margin
doesn't. That's a good example of a layout decision that looks arbitrary until you
know the constraint.

The general trade-off: you gain per-column control, and you own the balancing.
Round-robin (`i % 4`) is even by _count_, not by _height_ — with mixed portrait and
landscape you'll get a ragged bottom. The fix is a shortest-column heuristic, which
needs heights, which means measuring, which means JavaScript:

```ts
// Greedy: each item goes to whichever column is currently shortest.
const heights = new Array(4).fill(0);
for (const pin of pins) {
  const shortest = heights.indexOf(Math.min(...heights));
  columns[shortest].push(pin);
  heights[shortest] += estimatedHeight(pin);
}
```

That greedy pass is, roughly, what multi-column's balancing does for you natively.

---

## 6. Approach 4 — JavaScript positioning, and why it's last

Measure every tile, absolutely position each one, recompute on resize. This is what
the classic masonry libraries do, and it's how Pinterest itself works.

Reach for it when you need something the CSS approaches genuinely can't do:
animated re-ordering, drag-and-drop, virtualised scrolling over 50,000 tiles.

The costs are real, and they're the reason it's the last resort:

- **Content-visible flash.** The server can't know the layout, so tiles start
  stacked and jump into place after hydration and image load.
- **Every resize is a JavaScript reflow**, plus a `ResizeObserver` to notice.
- **It breaks without JS**, so the first paint of a public page is empty — bad for
  perceived speed and for crawlers.
- **It fights infinite scroll**, because each new page re-measures everything
  above it.

In this app the wall must render server-side (`/` is public and pins are the
content), so this approach was never a candidate. That constraint — _does the first
HTML response need to contain the layout?_ — is usually the whole decision.

---

## 7. Native CSS masonry

There is ongoing work to add real masonry to CSS — you'll see two competing
shapes discussed, `grid-template-rows: masonry` and a newer `item-flow` proposal —
and browsers have shipped pieces of it behind flags at various points.

**Check [caniuse.com](https://caniuse.com) before you rely on any of it**, because
the answer changes and this document doesn't. When it does land, it gives you
row-major order _and_ true shortest-column packing — the one combination none of
the four approaches above delivers.

Meanwhile it degrades gracefully as an enhancement:

```css
.wall { column-count: 4; }                     /* today, everywhere */

@supports (grid-template-rows: masonry) {      /* opt in where it exists */
  .wall { columns: unset; display: grid; grid-template-columns: repeat(4, 1fr);
          grid-template-rows: masonry; }
}
```

---

## 8. Making the images behave

The layout is the easy half. What makes a photo wall feel fast is what you do with
the `<img>` tags.

### Reserve the space

```tsx
<img
  src={cdnImage(pin.imageUrl, { width: 500 })}
  alt={pin.title}
  width={pin.width}       // ← intrinsic size, not display size
  height={pin.height}
  className="h-auto w-full object-cover"
  loading="lazy"
  decoding="async"
/>
```

`width` and `height` don't set the rendered size here — `w-full h-auto` does. They
give the browser the **aspect ratio**, so it can reserve exactly the right box
before a single byte of image arrives. Omit them and every image load shoves
everything below it downwards: that's Cumulative Layout Shift, and on a masonry
wall it's brutal because a single late image re-balances a whole column.

This is also why `PinDoc` stores `width` and `height`, and why `createPin` records
what Cloudinary reports on upload.

### Don't ship a 4000px photo into a 300px tile

[`lib/cloudinary-url.ts`](../lib/cloudinary-url.ts)'s `cdnImage()` rewrites a
Cloudinary URL to ask for a 500px-wide version at the edge; non-Cloudinary URLs
pass through untouched. The detail page asks for `width: 1200` instead — bigger,
because there it's the thing you came to look at.

A useful next step is `srcset`, so a 2× display gets 1000px and a phone gets 500:

```tsx
<img
  src={cdnImage(pin.imageUrl, { width: 500 })}
  srcSet={`${cdnImage(pin.imageUrl, { width: 500 })} 500w, ${cdnImage(pin.imageUrl, { width: 1000 })} 1000w`}
  sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 16vw"
/>
```

### `loading="lazy"` — but not on everything

Lazy-load grid tiles; **never** lazy-load the hero image on a detail page. Look at
[`app/pin/[id]/page.tsx`](../app/pin/[id]/page.tsx): the big image is eager with
`fetchPriority="high"`, because it's the Largest Contentful Paint element and
deferring it directly worsens the metric users feel.

A refinement worth knowing: the first few tiles of a wall are above the fold, so
`loading="lazy"` on them is also counterproductive. Eager-load the first ~6 and
lazy-load the rest.

### Why plain `<img>` and not `next/image`?

`next/image` needs every remote host allow-listed in `next.config.ts`. Pins can
point anywhere — that's the feature. The comment in `pin-card.tsx` says exactly
this. In exchange we do the resizing ourselves through Cloudinary, which is the
part `next/image` was mostly buying us.

---

## 9. Choosing column counts

```
columns-2  sm:columns-3  lg:columns-4  xl:columns-5  2xl:columns-6
```

Design the **tile width**, not the column count. Pinterest-ish tiles want to land
around 230–300px: wide enough to read the image, narrow enough that the wall feels
dense.

The comment in `pin-grid.tsx` records the reasoning: pages run full-bleed up to
`--container-page` (1660px), so stopping at four columns would stretch each tile to
~380px on a laptop and far wider on a desktop — the opposite of a dense wall. Six
columns at 1660px ≈ 260px per tile. That's the number the breakpoint ladder is
aimed at.

An alternative worth knowing, though it's not what this repo uses:

```css
/* "As many ~260px columns as fit" — no breakpoints at all. */
.wall { columns: 260px; }
```

`column-width` instead of `column-count` lets the browser decide how many fit.
Fewer knobs, but you lose per-breakpoint control of the gap and the ability to say
"never more than six".

---

## 10. Debugging checklist

| Symptom | Cause |
| --- | --- |
| Tiles touch vertically | Missing `*:mb-4` — `gap` is horizontal-only in multi-column. |
| A card is sliced across two columns | Missing `break-inside-avoid` on the tile. |
| One absurdly tall first column | A tile with no height reservation, or `break-inside-avoid` on a child instead of the tile root. |
| Everything in one column | Ancestor is `display: flex`/`grid` and squashed the multi-column container, or a `sm:` breakpoint didn't apply. |
| Layout jumps as photos load | No `width`/`height` on `<img>`. |
| Buttons on tiles render above the sticky header | Missing `isolate` on the tile — see §2. |
| Last row wildly uneven | Normal for multi-column (it balances total height). If it must be flush, you want grid spans. |
| A newly appended page re-shuffles earlier tiles | Multi-column re-balances all columns. Grid spans don't — another reason to prefer them with infinite scroll. |

---

## 11. Exercises

1. **Feel the failure modes.** In DevTools, delete `break-inside-avoid` from a
   card, then `*:mb-4` from the wrapper. Watch each specific breakage so you
   recognise it later.
2. **Count the reading order.** On a wide window, hover the first six tiles on
   `/` and check their dates against `createdAt`. Confirm for yourself that the top
   row isn't the six newest (§3).
3. **Build the grid-span version.** Add the component from §4 next to `PinGrid`
   and render `/discover` with it. Compare: is the bottom edge raggeder? Does
   row-major order feel better for search results than for the home wall?
4. **Add `srcset`.** Use the snippet in §8, then check the Network panel on a
   phone-sized viewport to confirm the smaller file is actually chosen.
5. **Eager-load the first six tiles.** `PinGrid` maps with an index — use it to
   pass `loading={index < 6 ? "eager" : "lazy"}` down to `PinCard`. Measure LCP in
   Lighthouse before and after.
6. **Then read [`INFINITE-SCROLL.md`](./INFINITE-SCROLL.md).** The wall and the
   paging are one system: `InfiniteFeed` renders the same `columns-*` wall and
   appends to it, and §10's last row explains a bug you'd otherwise meet on your
   own.
