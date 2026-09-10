// The 64-bit perceptual hash, drawn as the 8×8 grid it actually is.
//
// `9754f0f56f290a2a` is a fact about an image that no one can read. The same 64
// bits laid out as a grid of light and dark squares is something a person can
// compare at a glance: two near-duplicates visibly share a pattern, and two
// unrelated photographs visibly do not.
//
// The layout is not decorative. Each square IS one coefficient of the top-left
// 8×8 block of the DCT (see lib/algorithms/phash.ts), in the same order — so the
// top-left square is the DC term and frequency increases down and to the right.
// The grid is a picture of the low-frequency structure the hash kept.

import { hashToBits, isPerceptualHash, HASH_BLOCK_SIZE } from "@/lib/algorithms/phash";
import { cn } from "@/lib/utils";

export default function HashGrid({
  hash,
  size = 64,
  className,
  /** Bits that differ from another hash — rendered in red, so a diff is visible. */
  diffAgainst,
}: {
  hash: string;
  size?: number;
  className?: string;
  diffAgainst?: string;
}) {
  if (!isPerceptualHash(hash)) return null;

  const bits = hashToBits(hash);
  const otherBits = diffAgainst && isPerceptualHash(diffAgainst) ? hashToBits(diffAgainst) : null;

  return (
    <div
      className={cn("grid overflow-hidden rounded ring-1 ring-black/10 dark:ring-white/15", className)}
      style={{
        gridTemplateColumns: `repeat(${HASH_BLOCK_SIZE}, 1fr)`,
        width: size,
        height: size,
      }}
      role="img"
      aria-label={`Perceptual hash ${hash}, drawn as an 8 by 8 grid`}
      title={hash}
    >
      {bits.map((bit, index) => {
        const differs = otherBits ? otherBits[index] !== bit : false;

        return (
          <div
            key={index}
            className={cn(
              differs
                ? "bg-red-500"
                : bit
                  ? "bg-zinc-900 dark:bg-zinc-100"
                  : "bg-zinc-200 dark:bg-zinc-800",
            )}
          />
        );
      })}
    </div>
  );
}
