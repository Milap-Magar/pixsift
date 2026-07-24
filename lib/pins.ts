// ── A tiny in-memory "database" of pins ─────────────────────────────────────
// This lives in server memory. It's perfect for learning, but note:
//   - It RESETS every time the dev server restarts.
//   - It is NOT shared across multiple server instances (e.g. in production).
// The natural next step is to swap these functions for real MongoDB queries
// (you already have a connection string in .env) — the rest of the app won't
// need to change, because everything goes through these helpers.

export type Pin = {
  id: string;
  title: string;
  imageUrl: string;
  author: string; // name/email of whoever added it
  createdAt: number;
};

// Seed data so the landing page isn't empty on first load.
// Images come from picsum.photos (free placeholder photos).
const pins: Pin[] = [
  { id: "1", title: "Misty mountains", imageUrl: "https://picsum.photos/seed/mountain/500/700", author: "PixSift", createdAt: 1 },
  { id: "2", title: "City at night", imageUrl: "https://picsum.photos/seed/city/500/500", author: "PixSift", createdAt: 2 },
  { id: "3", title: "Forest path", imageUrl: "https://picsum.photos/seed/forest/500/800", author: "PixSift", createdAt: 3 },
  { id: "4", title: "Ocean waves", imageUrl: "https://picsum.photos/seed/ocean/500/600", author: "PixSift", createdAt: 4 },
  { id: "5", title: "Desert dunes", imageUrl: "https://picsum.photos/seed/desert/500/450", author: "PixSift", createdAt: 5 },
  { id: "6", title: "Autumn leaves", imageUrl: "https://picsum.photos/seed/autumn/500/750", author: "PixSift", createdAt: 6 },
  { id: "7", title: "Snowy cabin", imageUrl: "https://picsum.photos/seed/cabin/500/550", author: "PixSift", createdAt: 7 },
  { id: "8", title: "Wildflowers", imageUrl: "https://picsum.photos/seed/flowers/500/700", author: "PixSift", createdAt: 8 },
];

// Newest first.
export function getPins(): Pin[] {
  return [...pins].sort((a, b) => b.createdAt - a.createdAt);
}

export function addPin(input: { title: string; imageUrl: string; author: string }): Pin {
  const pin: Pin = {
    id: String(pins.length + 1) + "-" + Math.round(Math.random() * 1e6),
    title: input.title,
    imageUrl: input.imageUrl,
    author: input.author,
    createdAt: Date.now(),
  };
  pins.push(pin);
  return pin;
}
