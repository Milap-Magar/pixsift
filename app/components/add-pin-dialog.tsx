"use client";

// "Add a photo" as a dialog, so you never leave the grid you're looking at.
//
// Two ways in, switched with a small tab strip:
//   Upload — drag & drop / browse / paste, goes to Cloudinary
//   Link   — paste an image URL, stored as-is
//
// The form posts to createPinAction via useActionState, which hands back a
// `pending` flag for the button and an `error` string to show inline. On success
// the action revalidates / and /dashboard, so the new pin is already in the grid
// behind the dialog by the time it closes.

import { useActionState, useRef, useState } from "react";
import { ImagePlus, Link2, LoaderCircle, Upload, X } from "lucide-react";

import { createPinAction, type CreatePinState } from "@/app/actions/pins";
import { buttonVariants } from "@/components/ui/button";
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

import ImageDropzone from "./image-dropzone";

const inputClasses =
  "h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Mode = "upload" | "link";

type AddPinDialogProps = {
  children: React.ReactNode;
  className?: string;
  /**
   * Whether Cloudinary credentials are present. Decided on the server and passed
   * down, since the client must never see the config. When false the Upload tab
   * explains what's missing and the Link tab is the default.
   */
  uploadEnabled?: boolean;
};

export default function AddPinDialog({
  children,
  className,
  uploadEnabled = false,
}: AddPinDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(uploadEnabled ? "upload" : "link");
  const [imageUrl, setImageUrl] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState<CreatePinState, FormData>(
    // Wrapping the action (rather than reacting to its result in an effect) is
    // what lets us close the dialog on success: this runs inside the action's
    // transition, so the reset and the close are part of the same update.
    async (previousState, formData) => {
      const result = await createPinAction(previousState, formData);
      if (result.createdId) {
        setImageUrl("");
        formRef.current?.reset();
        setOpen(false);
      }
      return result;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={className}>{children}</DialogTrigger>

      <DialogPortal>
        <DialogBackdrop />

        <DialogPopup className="w-md gap-5">
          <DialogClose
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </DialogClose>

          <div className="flex flex-col gap-1">
            <DialogTitle>Add a photo</DialogTitle>
            <DialogDescription>
              Upload from your device, or point at an image on the web.
            </DialogDescription>
          </div>

          {/* Mode switch */}
          <div className="flex gap-1 rounded-full bg-muted p-1">
            <ModeTab
              active={mode === "upload"}
              onClick={() => setMode("upload")}
              icon={<Upload className="size-3.5" />}
              label="Upload"
            />
            <ModeTab
              active={mode === "link"}
              onClick={() => setMode("link")}
              icon={<Link2 className="size-3.5" />}
              label="Link"
            />
          </div>

          <form ref={formRef} action={formAction} className="flex flex-col gap-4">
            {/* Both panels stay mounted so switching tabs doesn't throw away
                what you already typed — the hidden one just isn't submitted. */}
            <div className={cn(mode === "upload" ? "block" : "hidden")}>
              {uploadEnabled ? (
                <ImageDropzone name={mode === "upload" ? "file" : "file-inactive"} />
              ) : (
                <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Uploads aren&rsquo;t configured yet</p>
                  <p className="mt-1">
                    Add <code className="font-mono text-xs">CLOUDINARY_CLOUD_NAME</code> and{" "}
                    <code className="font-mono text-xs">CLOUDINARY_API_KEY</code> to{" "}
                    <code className="font-mono text-xs">.env</code>, then restart. Use the Link tab
                    meanwhile.
                  </p>
                </div>
              )}
            </div>

            <div className={cn("flex-col gap-4", mode === "link" ? "flex" : "hidden")}>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Image URL</span>
                <input
                  name={mode === "link" ? "imageUrl" : "imageUrl-inactive"}
                  type="url"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://picsum.photos/seed/anything/500/700"
                  className={inputClasses}
                />
              </label>

              {imageUrl ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  {/* Live preview of what will be pinned. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" className="max-h-56 w-full object-cover" />
                </div>
              ) : null}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Title</span>
              <input
                name="title"
                required
                maxLength={120}
                placeholder="A calm sunset"
                className={inputClasses}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                Description <span className="text-muted-foreground">(optional)</span>
              </span>
              <textarea
                name="description"
                rows={2}
                maxLength={500}
                placeholder="Where it's from, why you saved it…"
                className={cn(inputClasses, "h-auto resize-none py-2")}
              />
            </label>

            {state.error ? (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className={cn(
                buttonVariants({ variant: "default" }),
                "h-10 w-full gap-2 rounded-full",
              )}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {pending ? (mode === "upload" ? "Uploading…" : "Adding…") : "Add pin"}
            </button>
          </form>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
