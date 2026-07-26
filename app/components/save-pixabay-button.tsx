"use client";

// "Save this Pixabay image to my board."
//
// This is the moment a borrowed image becomes ours: until it's pressed nothing
// is stored anywhere, and pressing it POSTs the metadata (link, title,
// description, tags, provider id) to /api/dashboard, which writes the single
// MongoDB document. The bytes stay on Pixabay's servers.
//
// Lives on its own because two very different surfaces need the identical
// request-and-error logic: the round overlay on a grid tile, and the labelled
// pill on the details page. Only the styling differs — hence `variant`.

import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";

import type { PixabayImage } from "@/lib/pixabay";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

const BUTTON_CLASSES = {
  icon: "absolute top-3 right-3 z-20 grid size-9 place-items-center rounded-full shadow-md backdrop-blur transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none",
  pill: "flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none",
} as const;

const MESSAGE_CLASSES = {
  icon: "absolute top-14 right-3 z-20 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white",
  pill: "text-xs text-zinc-500",
} as const;

export default function SavePixabayButton({
  image,
  signedIn,
  variant = "icon",
  className,
}: {
  image: PixabayImage;
  signedIn: boolean;
  variant?: "icon" | "pill";
  className?: string;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (state === "saving" || state === "saved") return;

    setState("saving");
    setMessage(null);

    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: image.title,
          description: image.description,
          imageUrl: image.imageUrl,
          thumbUrl: image.thumbUrl,
          width: image.width,
          height: image.height,
          provider: "pixabay",
          providerId: image.providerId,
          providerPageUrl: image.pageUrl,
          credit: image.credit.name,
          tags: image.tags,
        }),
      });

      // 409 is the database's unique index saying "you already saved this one" —
      // not an error worth shouting about, so it lands in the same 'saved' state.
      if (response.status === 409) {
        setState("saved");
        setMessage("Already in your board");
        return;
      }

      if (response.status === 401) {
        setState("error");
        setMessage("Sign in to save");
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Save failed (${response.status})`);
      }

      setState("saved");
    } catch (cause) {
      setState("error");
      setMessage(cause instanceof Error ? cause.message : "Save failed");
    }
  }

  const saved = state === "saved";

  return (
    <>
      <button
        type="button"
        onClick={() => void save()}
        disabled={state === "saving" || saved}
        aria-label={saved ? "Saved" : `Save "${image.title}"`}
        className={cn(
          BUTTON_CLASSES[variant],
          saved
            ? "bg-green-600 text-white"
            : cn(
                "cursor-pointer",
                variant === "icon" &&
                  "bg-white/85 text-zinc-700 hover:bg-white dark:bg-black/60 dark:text-zinc-200",
                variant === "pill" && "hover:bg-muted",
              ),
          className,
        )}
      >
        {state === "saving" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : saved ? (
          <Check className="size-4" />
        ) : (
          <Plus className="size-4" />
        )}
        {variant === "pill" && (saved ? "Saved" : signedIn ? "Save" : "Sign in to save")}
      </button>

      {message && <p className={MESSAGE_CLASSES[variant]}>{message}</p>}
    </>
  );
}
