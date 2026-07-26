"use client";

// The scroll-to-load machinery, with no opinion about what it's loading.
//
// Both the pin grid and the mixed home feed use this: they differ only in which
// endpoint they call and how they pull items out of the response, so that's
// exactly what they pass in.
//
// IMPORTANT for callers: pass a `select` defined at MODULE scope, not inline. An
// inline arrow is a new function on every render, which would re-create the
// observer on every render.

import { useCallback, useEffect, useRef, useState } from "react";

type Options<T> = {
  initialItems: T[];
  /** `null` means the server already sent everything. */
  initialCursor: string | null;
  endpoint: string;
  pageSize?: number;
  /** Pulls `{ items, nextCursor }` out of whatever shape the endpoint returns. */
  select: (payload: unknown) => { items: T[]; nextCursor: string | null };
  /** Stable identity per item, used to drop anything already on screen. */
  getKey: (item: T) => string;
};

export function useInfiniteList<T>({
  initialItems,
  initialCursor,
  endpoint,
  pageSize = 30,
  select,
  getKey,
}: Options<T>) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sentinel = useRef<HTMLDivElement>(null);

  // A ref, not state: this guards against overlapping fetches and has to be
  // readable and writable synchronously — a state update wouldn't have landed
  // before a second observer callback fired.
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursor) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("cursor", cursor);
      url.searchParams.set("limit", String(pageSize));

      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);

      const page = select(await response.json());

      setItems((current) => {
        // The same image can legitimately appear under two Pixabay topics, and
        // React would warn about the duplicate key.
        const seen = new Set(current.map(getKey));
        return [...current, ...page.items.filter((item) => !seen.has(getKey(item)))];
      });
      setCursor(page.nextCursor);
    } catch (cause) {
      // Keep the cursor: "Try again" then resumes from the same place.
      setError(cause instanceof Error ? cause.message : "Could not load more.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, endpoint, getKey, pageSize, select]);

  // Re-registered whenever `cursor` changes — i.e. once per page. That's the
  // point: if the sentinel is STILL in view after a page lands (tall screen,
  // short page), the fresh observer fires again and keeps filling the viewport.
  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      // Fire well before the sentinel is actually visible, so the next page has
      // usually landed by the time the user reaches the bottom.
      { rootMargin: "800px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  return { items, loading, error, done: !cursor, loadMore, sentinel };
}
