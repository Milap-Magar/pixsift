"use client";

// "Public / Private" for a pin you own, on its details page.
//
// A Client Component because it's an optimistic control: the label flips the
// instant you click, and only rolls back if the server disagrees. Waiting for a
// round trip to redraw a two-state switch feels broken even when it's fast.
//
// `useTransition` rather than a bare `await`: it keeps the pending flag in React's
// hands, so the button is disabled for exactly as long as the action (and the
// re-render it triggers) is in flight.

import { useState, useTransition } from "react";
import { Globe, Loader2, Lock } from "lucide-react";

import { setPinVisibilityAction } from "@/app/actions/pins";
import { cn } from "@/lib/utils";
import type { Visibility } from "@/lib/visibility";

export default function VisibilityToggle({
  pinId,
  visibility,
  className,
}: {
  pinId: string;
  visibility: Visibility;
  className?: string;
}) {
  const [current, setCurrent] = useState<Visibility>(visibility);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isPrivate = current === "private";
  const next: Visibility = isPrivate ? "public" : "private";

  function toggle() {
    setError(null);
    // Optimistic: show the new state now, put it back if the server refuses.
    const previous = current;
    setCurrent(next);

    startTransition(async () => {
      const result = await setPinVisibilityAction(pinId, next);

      if (result.error || !result.visibility) {
        setCurrent(previous);
        setError(result.error ?? "Couldn't change that.");
        return;
      }

      // Trust the server's answer over our guess — they agree here, but this is
      // the line that keeps them from drifting if the rule ever gets smarter.
      setCurrent(result.visibility);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isPrivate}
        title={
          isPrivate
            ? "Only you can see this pin. Click to make it public."
            : "Anyone can see this pin. Click to make it private."
        }
        className={cn(
          "flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition disabled:opacity-60",
          isPrivate
            ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
            : "border-border hover:bg-muted",
          className,
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isPrivate ? (
          <Lock className="size-4" />
        ) : (
          <Globe className="size-4" />
        )}
        {isPrivate ? "Private" : "Public"}
      </button>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
