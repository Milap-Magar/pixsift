// ── Colour spaces and colour distance ───────────────────────────────────────
//
// Support code for the k-means palette extractor in ./kmeans.ts, kept separate
// because it is PURE and CLIENT-SAFE: no `sharp`, no `process.env`, no I/O. The
// swatch components import it directly to decide whether a colour needs black
// or white text on top of it.
//
// ── The thing worth understanding here ─────────────────────────────────────
// RGB is a storage format, not a perceptual one. Equal steps in RGB are NOT
// equal steps in apparent colour: the human eye separates greens far more
// finely than blues, so a distance of 30 in the green channel is a visibly
// larger change than a distance of 30 in blue. Plain Euclidean distance in RGB
// therefore disagrees with people about which of two colours is "closer", and
// it disagrees worst exactly where photographs spend most of their pixels —
// foliage, skin, sky.
//
// CIELAB was designed to fix this. It is APPROXIMATELY perceptually uniform:
// equal distances in Lab correspond to roughly equal perceived differences. Its
// axes are meaningful rather than arbitrary — L* is lightness (0 black, 100
// white), a* runs green→red, b* runs blue→yellow.
//
// So colour SEARCH ranks in Lab (see `deltaE`), because ranking is the part a
// person judges directly: they pick a colour and immediately have an opinion
// about whether the results match. See docs/algorithms/03-kmeans-color.md §5
// for why the CLUSTERING deliberately stays in RGB even so.

export type Rgb = { r: number; g: number; b: number };
export type Lab = { l: number; a: number; b: number };

/** One entry in a stored palette: the colour, and how much of the image it covers. */
export type Swatch = {
  /** 0–255, rounded — the cluster centroid. */
  r: number;
  g: number;
  b: number;
  /** `#rrggbb`, stored alongside so the UI never recomputes it. */
  hex: string;
  /** Fraction of sampled pixels in this cluster, 0–1. The palette sums to ~1. */
  share: number;
};

const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Parses `#rgb`, `#rrggbb` (with or without the hash). Returns null if it isn't one. */
export function fromHex(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, "").toLowerCase();

  if (/^[0-9a-f]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }

  if (/^[0-9a-f]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  return null;
}

// ── sRGB → CIELAB ───────────────────────────────────────────────────────────
// Two hops, because there is no direct formula: sRGB → CIE XYZ → CIELAB.

/**
 * Undo the sRGB transfer function ("gamma").
 *
 * The bytes in an image file are NOT proportional to light intensity — they are
 * deliberately warped so that the 256 available steps are spread evenly across
 * *perceived* brightness rather than physical brightness, which is where the
 * eye's precision actually is. Every colour-space formula below assumes linear
 * light, so this warp has to be undone first.
 *
 * Skipping this step is the single most common bug in hand-written colour
 * conversion, and it is a quiet one: the numbers stay plausible and the ranking
 * is merely a bit wrong, most visibly in the dark tones where the curve is
 * steepest.
 */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** The D65 reference white — "what counts as white", i.e. average daylight. */
const WHITE_X = 0.95047;
const WHITE_Y = 1.0;
const WHITE_Z = 1.08883;

/** The non-linear compression CIELAB applies, with a linear segment near zero. */
function labCurve(t: number): number {
  // (6/29)³ — below this the cube root's slope runs away towards infinity, so
  // the standard substitutes a straight line to keep the transform stable.
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27) * t / 116 + 4 / 29;
}

export function rgbToLab({ r, g, b }: Rgb): Lab {
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);

  // sRGB primaries under D65 (IEC 61966-2-1). These constants encode which
  // physical red, green and blue an sRGB display is defined to emit.
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / WHITE_X;
  const y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / WHITE_Y;
  const z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / WHITE_Z;

  const fx = labCurve(x);
  const fy = labCurve(y);
  const fz = labCurve(z);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * CIE76 ΔE — straight Euclidean distance in Lab.
 *
 * Roughly: ΔE ≈ 1 is the smallest difference a person can see side by side,
 * ~2–3 is noticeable in context, >10 reads as "a different colour". Those
 * numbers are what make the colour-search cutoffs meaningful rather than
 * arbitrary — a threshold in ΔE can be stated in terms of human perception,
 * which a threshold in RGB units cannot.
 *
 * CIE76 rather than the later CIE94 or CIEDE2000: those are more accurate,
 * particularly for highly saturated colours, at the cost of a page of
 * correction terms. This project RANKS by distance and never reports an
 * absolute perceptual claim, and ranking is preserved by all three for the
 * broad, well-separated distances a palette search deals in. It is the right
 * trade here and the wrong one for, say, print proofing — which is the sort of
 * distinction the report should make explicitly.
 */
export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

/** ΔE between two RGB colours, converting both on the way. */
export function colorDistance(a: Rgb, b: Rgb): number {
  return deltaE(rgbToLab(a), rgbToLab(b));
}

/**
 * Relative luminance per WCAG 2.1 — the perceived brightness of a colour,
 * 0 (black) to 1 (white).
 */
export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Black or white text, whichever is more readable on this background.
 *
 * The 0.179 pivot is not a guess: it is the luminance at which contrast against
 * white and contrast against black are exactly equal under the WCAG ratio
 * (L+0.05)/(L'+0.05). Above it, black text wins; below it, white does. Using it
 * means every swatch label in the app is the more legible of the two options
 * rather than whichever looked fine on the colours that happened to be on
 * screen while the component was written.
 */
export function readableTextOn(color: Rgb): "#000000" | "#ffffff" {
  return luminance(color) > 0.179 ? "#000000" : "#ffffff";
}

// ── Colour families ─────────────────────────────────────────────────────────
// Used for the filter chips on /colors. Derived from the palette rather than
// stored, so changing these buckets needs no migration.

export type ColorFamily =
  | "red" | "orange" | "yellow" | "green" | "cyan"
  | "blue" | "purple" | "pink" | "neutral";

/** Hue in degrees (0–360), saturation and value as 0–1. */
export function rgbToHsv({ r, g, b }: Rgb): { h: number; s: number; v: number } {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const span = max - min;

  let h = 0;
  if (span !== 0) {
    if (max === R) h = ((G - B) / span) % 6;
    else if (max === G) h = (B - R) / span + 2;
    else h = (R - G) / span + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : span / max, v: max };
}

/**
 * Which colour family a swatch belongs to.
 *
 * Saturation is checked BEFORE hue on purpose. A near-grey pixel still has a
 * hue — it is just meaningless, because it is the ratio of three nearly-equal
 * numbers and a rounding error can swing it 180°. Bucketing greys by hue is how
 * a photograph of concrete ends up filed under "purple".
 */
export function colorFamily(color: Rgb): ColorFamily {
  const { h, s, v } = rgbToHsv(color);
  if (s < 0.15 || v < 0.12) return "neutral";

  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 195) return "cyan";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

export const COLOR_FAMILIES: ReadonlyArray<{ key: ColorFamily; label: string; swatch: string }> = [
  { key: "red", label: "Red", swatch: "#e02424" },
  { key: "orange", label: "Orange", swatch: "#f97316" },
  { key: "yellow", label: "Yellow", swatch: "#eab308" },
  { key: "green", label: "Green", swatch: "#22a355" },
  { key: "cyan", label: "Cyan", swatch: "#06b6d4" },
  { key: "blue", label: "Blue", swatch: "#2563eb" },
  { key: "purple", label: "Purple", swatch: "#7c3aed" },
  { key: "pink", label: "Pink", swatch: "#db2777" },
  { key: "neutral", label: "Neutral", swatch: "#71717a" },
];
