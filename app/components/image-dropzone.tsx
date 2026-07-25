"use client";

// Drag & drop, click to browse, or paste from the clipboard.
//
// The trick that keeps this simple: there's a real <input type="file"> behind
// the panel, and dropping assigns the dropped file to `input.files` via a
// DataTransfer. So the form submits the file natively — no manual FormData
// juggling, and it still works exactly like a normal file input.

import { useRef, useState } from "react";
import { ImageUp, X } from "lucide-react";

import {
  IMAGE_ACCEPT_ATTRIBUTE,
  MAX_UPLOAD_BYTES,
  formatBytes,
  isAcceptedImageType,
} from "@/lib/upload-limits";
import { cn } from "@/lib/utils";

type ImageDropzoneProps = {
  /** Form field name. Must match what the Server Action reads. */
  name?: string;
  disabled?: boolean;
  /** Told whether a valid file is currently staged. */
  onFileChange?: (file: File | null) => void;
};

export default function ImageDropzone({
  name = "file",
  disabled,
  onFileChange,
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ name: string; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    // Object URLs hold the file in memory until released.
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setStaged(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onFileChange?.(null);
  }

  /** Validates, previews, and (when needed) writes the file into the input. */
  function accept(file: File, assignToInput: boolean) {
    // The server checks all of this again — this is just for instant feedback.
    if (!isAcceptedImageType(file.type)) {
      reset();
      setError("That's not a supported image (JPEG, PNG, WebP, GIF or AVIF).");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      reset();
      setError(`That image is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }

    if (assignToInput && inputRef.current) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
    }

    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setStaged({ name: file.name, size: file.size });
    setError(null);
    onFileChange?.(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;

    const file = event.dataTransfer.files?.[0];
    if (file) accept(file, true);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const file = Array.from(event.clipboardData.files)[0];
    if (file) {
      event.preventDefault();
      accept(file, true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        // A button role rather than a <button>, because a real button can't
        // legally contain the clear button that sits in the corner.
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Drop an image here, or click to browse"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={cn(
          "relative flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-border p-4 text-center transition outline-none",
          "hover:border-ring/60 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging && "border-ring bg-muted/60",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="max-h-56 w-full rounded-lg object-contain" />
            {staged && (
              <p className="text-xs text-muted-foreground">
                {staged.name} · {formatBytes(staged.size)}
              </p>
            )}
            <button
              type="button"
              aria-label="Remove image"
              onClick={(event) => {
                event.stopPropagation();
                reset();
              }}
              className="absolute top-2 right-2 cursor-pointer rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
            >
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            <ImageUp className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium">Drag an image here</p>
            <p className="text-xs text-muted-foreground">
              or click to browse · paste works too · up to {formatBytes(MAX_UPLOAD_BYTES)}
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={IMAGE_ACCEPT_ATTRIBUTE}
          disabled={disabled}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Already in the input — no need to reassign it.
            if (file) accept(file, false);
            else reset();
          }}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
