"use client";

// The living Pinterest-style wall we show BEHIND the login dialog.
//
// Two things make it feel alive rather than like a screenshot:
//   1. Every column is an infinite vertical marquee (alternating up / down at
//      different speeds) — see the keyframes in app/globals.css.
//   2. Every couple of seconds one random tile quietly swaps to a fresh photo.
//
// It's purely decorative: aria-hidden + pointer-events-none, so it never steals
// focus or clicks from the dialog in front of it. Motion is disabled for users
// who ask for reduced motion.

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const COLUMNS = 5;
const ROWS = 4;

// Varied tile heights are what give the wall its masonry rhythm.
const HEIGHTS = [640, 440, 780, 520, 600, 480];
const DURATIONS = ["52s", "68s", "58s", "76s", "62s"];

export default function PhotoWall({ className }: { className?: string }) {
  // generations[col][row] — bumping a number changes that tile's picsum seed,
  // which changes its photo. Starts all-zero so the server and the first client
  // render produce identical markup.
  const [generations, setGenerations] = useState<number[][]>(() =>
    Array.from({ length: COLUMNS }, () => Array.from({ length: ROWS }, () => 0)),
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(() => {
      setGenerations((prev) => {
        const col = Math.floor(Math.random() * COLUMNS);
        const row = Math.floor(Math.random() * ROWS);
        const next = prev.map((column) => [...column]);
        next[col][row] += 1;
        return next;
      });
    }, 2400);

    return () => clearInterval(timer);
  }, []);

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="flex h-full w-full gap-3 p-3">
        {generations.map((column, colIndex) => (
          <div key={colIndex} className="min-w-0 flex-1 overflow-hidden">
            <div
              // The track holds the tiles TWICE, so animating to translateY(-50%)
              // lands exactly where the loop started. Percentage transforms are
              // relative to the element's own height, so this stays seamless no
              // matter how tall the images end up.
              className={cn(
                "will-change-transform motion-reduce:animate-none",
                colIndex % 2 === 0
                  ? "animate-[pixsift-wall-up_var(--wall-duration)_linear_infinite]"
                  : "animate-[pixsift-wall-down_var(--wall-duration)_linear_infinite]",
              )}
              style={{ "--wall-duration": DURATIONS[colIndex] } as React.CSSProperties}
            >
              {[0, 1].map((copy) =>
                column.map((generation, rowIndex) => {
                  const seed = `pixsift-${colIndex}-${rowIndex}-${generation}`;
                  const height = HEIGHTS[(colIndex + rowIndex) % HEIGHTS.length];

                  return (
                    <div
                      key={`${copy}-${rowIndex}`}
                      // Margin (not flex `gap`) for the spacing, so each copy is
                      // exactly half the track height and the loop is exact.
                      className="mb-3 overflow-hidden rounded-2xl bg-white/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        // Re-keying on the seed remounts the image, which replays
                        // the fade — that's the visible "new photo" moment.
                        key={seed}
                        src={`https://picsum.photos/seed/${seed}/400/${height}`}
                        alt=""
                        width={400}
                        height={height}
                        className="h-auto w-full animate-in fade-in object-cover duration-1000"
                      />
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
