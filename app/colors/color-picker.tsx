"use client";

// The colour picker for /colors.
//
// Navigates rather than filtering in place: every colour is a real URL
// (`/colors?c=2b6cb0`), so a search is shareable, bookmarkable, and the back
// button walks through the colours you tried. The server does the ranking,
// which is also where the palettes already are.
//
// Three ways in, because people arrive with different amounts of precision:
// a swatch to click, a native colour wheel to drag, and a hex field to paste.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pipette } from "lucide-react";

import { fromHex, readableTextOn, toHex } from "@/lib/algorithms/color";
import { cn } from "@/lib/utils";

/**
 * A starting grid that covers the hue wheel plus a neutral ramp.
 *
 * Hand-picked rather than generated: an evenly-spaced HSL sweep produces
 * several colours that look identical at the same lightness (the eye separates
 * greens finely and blues coarsely), so a generated row wastes half its swatches
 * on distinctions nobody can see. These are spaced by appearance.
 */
const PRESETS = [
  "#e02424", "#f05252", "#ff8a4c", "#f97316", "#eab308", "#facc15",
  "#84cc16", "#22a355", "#0d9488", "#06b6d4", "#0ea5e9", "#2563eb",
  "#4f46e5", "#7c3aed", "#a855f7", "#db2777", "#f472b6", "#78350f",
  "#000000", "#404040", "#71717a", "#a1a1aa", "#d4d4d8", "#ffffff",
];

export default function ColorPicker({ selected }: { selected: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(selected);

  // Keep the field in step when the URL changes underneath us — a back-button
  // press, or a preset click. Without this the text input would keep showing
  // whatever was last typed while the results showed something else.
  //
  // Done by comparing against the previous prop DURING RENDER rather than in an
  // effect. React documents this as the way to adjust state when a prop
  // changes: it re-renders immediately with the corrected value, before
  // anything is painted. The effect version renders once with the stale draft,
  // then again with the right one — a visible flicker of the old colour, and an
  // extra render for a value that was already known.
  const [lastSelected, setLastSelected] = useState(selected);
  if (selected !== lastSelected) {
    setLastSelected(selected);
    setDraft(selected);
  }

  function search(hex: string) {
    const parsed = fromHex(hex);
    if (!parsed) return;
    router.push(`/colors?c=${toHex(parsed).slice(1)}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* The native colour input. Free on every platform, keyboard
            accessible, and on mobile it opens the OS picker people know. */}
        <label
          className="flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition hover:bg-muted"
          style={{ backgroundColor: draft, color: readableTextOn(fromHex(draft) ?? { r: 255, g: 255, b: 255 }) }}
        >
          <Pipette className="size-4" />
          Pick a colour
          <input
            type="color"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            // Committing on `blur` rather than on `change` is deliberate: a
            // native colour wheel fires `change` continuously as you drag, and
            // routing on each one would push fifty entries into the history
            // stack for a single gesture.
            onBlur={() => search(draft)}
            className="sr-only"
          />
        </label>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            search(draft);
          }}
          className="flex items-center gap-2"
        >
          <label htmlFor="hex" className="sr-only">
            Hex colour
          </label>
          <input
            id="hex"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="#2b6cb0"
            spellCheck={false}
            className="h-11 w-32 rounded-full border border-border bg-transparent px-4 font-mono text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button
            type="submit"
            className="h-11 cursor-pointer rounded-full border border-border px-4 text-sm font-medium transition hover:bg-muted"
          >
            Search
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((hex) => {
          const active = hex.toLowerCase() === selected.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              onClick={() => search(hex)}
              aria-label={hex}
              aria-pressed={active}
              title={hex}
              style={{ backgroundColor: hex }}
              className={cn(
                "size-8 cursor-pointer rounded-full ring-1 ring-black/10 transition hover:scale-110 dark:ring-white/20",
                active && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
