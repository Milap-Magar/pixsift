"use client";

// The download button, with a size picker.
//
// ── Why every item is an <a>, not a fetch ────────────────────────────────
// The routes behind these links set `Content-Disposition: attachment`, and a
// plain navigation to such a response makes the browser save the file without
// leaving the page. Doing it with `fetch` + `URL.createObjectURL` instead would
// mean holding the whole image in memory, would lose the browser's own download
// progress UI, and would break the "save link as" right-click menu people
// already know. The simplest thing is also the best-behaved one.
//
// `download` is set as well, so a same-origin response with a missing or
// unhelpful Content-Disposition still saves rather than navigates.

import { ChevronDown, Download } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DOWNLOAD_SIZES } from "@/lib/download";
import { cn } from "@/lib/utils";

export default function DownloadMenu({
  /** Where the file comes from — `/api/pins/<id>/download` or `/api/photos/<id>/download`. */
  href,
  className,
  /**
   * Whether the source can actually be resized.
   *
   * True for Cloudinary-hosted pins, where the width is a transformation in the
   * URL. False for a pasted link or a Pixabay photo, where only one or two
   * renditions exist — and in that case the menu says so rather than offering
   * four options that hand back the same file. An honest menu with one item
   * beats a generous one that lies.
   */
  resizable = true,
  maxWidth,
  label = "Download",
}: {
  href: string;
  className?: string;
  resizable?: boolean;
  /**
   * The original's width in pixels, when known.
   *
   * Sizes at or above it are dropped from the menu: Cloudinary's `c_limit`
   * never upscales, so offering "Large — 2048px" for an 800px photograph would
   * hand back the same 800px file under a name that claims otherwise. Offering
   * fewer, true options beats offering four where three are the same.
   */
  maxWidth?: number;
  label?: string;
}) {
  // "original" always survives; the rest have to be genuinely smaller than the
  // source to be worth showing.
  const sizes = DOWNLOAD_SIZES.filter(
    (size) => size.width === null || !maxWidth || size.width < maxWidth,
  );

  // Nothing to choose between — render a plain link and skip the menu entirely,
  // so the extra click doesn't exist when it would buy nothing.
  if (!resizable || sizes.length < 2) {
    return (
      <a href={href} download className={className}>
        <Download className="size-4" />
        {label}
      </a>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={className}>
        <Download className="size-4" />
        {label}
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Choose a size</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {sizes.map((size) => (
          <DropdownMenuItem
            key={size.key}
            // `render` rather than wrapping the item in an <a>: Base UI's menu
            // item owns the keyboard and focus behaviour, and nesting an anchor
            // inside it would leave two separately focusable things in one row.
            render={
              <a href={`${href}?size=${size.key}`} download>
                <span className="flex-1">{size.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {size.width ? `${size.width}px` : "full"}
                </span>
              </a>
            }
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same thing as a compact icon button, for grid tiles.
 *
 * `stopPropagation` matters here: pin cards use a stretched link whose ::after
 * covers the whole tile, so a click that reaches it navigates to the pin. The
 * download is meant to download, not navigate.
 */
export function DownloadIconButton({
  href,
  title,
  className,
}: {
  href: string;
  title: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      download
      onClick={(event) => event.stopPropagation()}
      aria-label={`Download ${title}`}
      title={`Download ${title}`}
      className={cn(
        "grid size-9 place-items-center rounded-full bg-white/85 text-zinc-700 shadow-md backdrop-blur transition hover:scale-105 hover:bg-white focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:bg-black/60 dark:text-zinc-200 dark:hover:bg-black/80",
        className,
      )}
    >
      <Download className="size-4" />
    </a>
  );
}
