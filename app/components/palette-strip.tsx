// The output of algorithm 3, made visible.
//
// A palette strip is the cheapest possible proof that k-means ran: five bars,
// each the width of the share of the image that cluster covers, in the colour
// of its centroid. Someone can hold it next to the photograph and agree or
// disagree in a second — which is a far better test of the clustering than any
// number this project could print.
//
// A Server Component: it only reads props and does arithmetic, so it ships no
// JavaScript to the browser.

import { readableTextOn, type Swatch } from "@/lib/algorithms/color";
import { cn } from "@/lib/utils";

export default function PaletteStrip({
  palette,
  className,
  showLabels = false,
  height = "h-10",
}: {
  palette: Swatch[];
  className?: string;
  /** Print the hex code and percentage inside each band. Off in grids, on in detail views. */
  showLabels?: boolean;
  height?: string;
}) {
  if (!palette.length) return null;

  return (
    <div
      className={cn("flex w-full overflow-hidden rounded-lg ring-1 ring-black/5 dark:ring-white/10", height, className)}
      // One label for the whole strip rather than one per band. A screen reader
      // announcing "dark slate blue, 34 percent" five times is noise; what the
      // strip actually communicates is the summary.
      role="img"
      aria-label={`Dominant colours: ${palette
        .map((swatch) => `${swatch.hex} at ${Math.round(swatch.share * 100)}%`)
        .join(", ")}`}
    >
      {palette.map((swatch) => (
        <div
          key={swatch.hex}
          // `flexGrow` from the share rather than a percentage width, so the
          // bands always fill the strip exactly even though the shares sum to
          // slightly under 1 (pixels in dropped empty clusters).
          style={{ backgroundColor: swatch.hex, flexGrow: swatch.share, flexBasis: 0 }}
          className="relative min-w-1 transition-[flex-grow] duration-300"
          title={`${swatch.hex} — ${(swatch.share * 100).toFixed(1)}%`}
        >
          {showLabels && swatch.share > 0.12 && (
            <span
              className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 font-mono text-[10px] leading-none"
              // Black or white, whichever is actually readable on this colour —
              // see readableTextOn(). Hardcoding one or the other is how a
              // palette strip ends up with invisible labels on half its bands.
              style={{ color: readableTextOn(swatch) }}
            >
              <span className="font-medium">{swatch.hex}</span>
              <span className="opacity-80">{Math.round(swatch.share * 100)}%</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
