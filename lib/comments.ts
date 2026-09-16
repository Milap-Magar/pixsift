// ── Comments, plus the pub/sub that makes them real-time ────────────────────
//
// Same in-memory caveat as lib/pins.ts: this resets on restart and isn't shared
// across server instances. The important part is the SHAPE — `addComment` and
// `subscribe` are the two functions the rest of the app talks to, so swapping
// the array for MongoDB (and the emitter for change streams / Redis pub-sub)
// later is a local change.
//
// How "real time" works:
//   1. someone posts    -> addComment() stores it and calls every listener
//   2. the SSE route     (app/api/pins/[id]/comments/stream) is one such listener
//   3. it pushes the comment down the open stream to every viewer of that pin
//   4. <CommentThread /> appends it — no refresh, no polling

import {
  DEMO_ACTIVITY_ENABLED,
  DEMO_USERS,
  SEED_COMMENTS,
  minutesAgo,
} from "./seed-data";

export type Comment = {
  id: string;
  pinId: string;
  body: string;
  author: string;
  authorId: string;
  authorImage?: string | null;
  createdAt: number;
};

export const MAX_COMMENT_LENGTH = 1000;

const comments: Comment[] = [];

// Demo conversation, so a fresh install doesn't look abandoned. Switch off with
// SEED_DEMO_ACTIVITY=false — see lib/seed-data.ts.
if (DEMO_ACTIVITY_ENABLED) {
  const nameById = new Map<string, string>(DEMO_USERS.map((user) => [user.id, user.name]));

  for (const [index, seed] of SEED_COMMENTS.entries()) {
    comments.push({
      // Deterministic ids: a stable key across renders, and obviously seed data
      // when you're looking at the store.
      id: `seed-${index}`,
      pinId: seed.pinId,
      body: seed.body,
      author: nameById.get(seed.userId) ?? "PixSift",
      authorId: seed.userId,
      createdAt: minutesAgo(seed.minutesAgo),
    });
  }
}

type Listener = (comment: Comment) => void;

// pinId -> everyone currently watching that pin's thread.
const listeners = new Map<string, Set<Listener>>();

/** Oldest first — that's how a thread reads. */
export function getComments(pinId: string): Comment[] {
  return comments.filter((c) => c.pinId === pinId).sort((a, b) => a.createdAt - b.createdAt);
}

export function countComments(pinId: string): number {
  return comments.reduce((total, c) => (c.pinId === pinId ? total + 1 : total), 0);
}

/** How many comments this person has written, across every pin. */
export function countCommentsByAuthor(authorId: string): number {
  return comments.reduce((total, c) => (c.authorId === authorId ? total + 1 : total), 0);
}

export function addComment(input: {
  pinId: string;
  body: string;
  author: string;
  authorId: string;
  authorImage?: string | null;
}): Comment {
  const comment: Comment = {
    id: `${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`,
    pinId: input.pinId,
    body: input.body,
    author: input.author,
    authorId: input.authorId,
    authorImage: input.authorImage,
    createdAt: Date.now(),
  };

  comments.push(comment);

  // Fan out to everyone watching. One broken listener (a stream that closed
  // between our check and the write) must not stop the others.
  for (const listener of listeners.get(input.pinId) ?? []) {
    try {
      listener(comment);
    } catch {
      // The stream is gone; its own cleanup will unsubscribe it.
    }
  }

  return comment;
}

/**
 * Drop a pin's whole thread. Called when the pin itself is deleted — a comment
 * on something that no longer exists has nowhere to render, and leaving it here
 * would keep the pin present in `countCommentsByAuthor` and in the dashboard
 * totals built on it.
 *
 * The listeners are left alone on purpose: an open SSE stream for a deleted pin
 * unsubscribes itself when the client disconnects, and tearing the set down here
 * wouldn't close those connections anyway.
 */
export function removeComments(pinId: string): number {
  let removed = 0;

  // Backwards, so the splice never shifts an index we haven't looked at yet.
  for (let index = comments.length - 1; index >= 0; index--) {
    if (comments[index].pinId === pinId) {
      comments.splice(index, 1);
      removed++;
    }
  }

  return removed;
}

/** Returns an unsubscribe function — call it when the stream closes. */
export function subscribe(pinId: string, listener: Listener): () => void {
  let set = listeners.get(pinId);
  if (!set) {
    set = new Set<Listener>();
    listeners.set(pinId, set);
  }
  set.add(listener);

  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(pinId);
  };
}
