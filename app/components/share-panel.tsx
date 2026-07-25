"use client";

// Sharing. `shareUrl` is resolved on the server from the request Host header, so
// it's the same string on both renders — no hydration mismatch, and the social
// links work without JavaScript.
//
// The primary button tries the native share sheet first (phones, Safari, Edge)
// and falls back to copying. That check happens in the click handler rather than
// at render time, because `navigator.share` doesn't exist during SSR.

import { useState } from "react";
import { Check, Copy, Share2, X } from "lucide-react";

import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type SharePanelProps = {
  title: string;
  shareUrl: string;
  className?: string;
  children: React.ReactNode;
};

export default function SharePanel({ title, shareUrl, className, children }: SharePanelProps) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);

  const targets = [
    { name: "X", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { name: "WhatsApp", href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}` },
    {
      name: "Pinterest",
      href: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedTitle}`,
    },
    { name: "Email", href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}` },
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin, or the user said no) — the input
      // below is selectable, so there's still a way to copy.
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        // Cancelled, or the sheet refused — fall through to copying.
      }
    }
    await copyLink();
  }

  return (
    <Dialog>
      <DialogTrigger className={className}>{children}</DialogTrigger>

      <DialogPortal>
        <DialogBackdrop />

        <DialogPopup className="gap-5">
          <DialogClose
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </DialogClose>

          <div className="flex flex-col gap-1">
            <DialogTitle>Share this pin</DialogTitle>
            <DialogDescription>Anyone with the link can view it.</DialogDescription>
          </div>

          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={copyLink}
              className={cn(
                "flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition",
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-primary text-primary-foreground hover:bg-primary/80",
              )}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <button
            type="button"
            onClick={share}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-border text-sm font-medium transition hover:bg-muted"
          >
            <Share2 className="size-4" />
            Share…
          </button>

          <div className="flex flex-wrap gap-2">
            {targets.map((target) => (
              <a
                key={target.name}
                href={target.href}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
              >
                {target.name}
              </a>
            ))}
          </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
