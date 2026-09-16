"use client";

// "Delete" for a pin you own.
//
// Deliberately NOT optimistic, unlike <VisibilityToggle> next to it. An
// optimistic control is a promise you can quietly take back; this one can't be
// taken back at all, so it waits for the server and says what happened. The
// confirmation dialog exists for the same reason — a misclick on a heart costs
// nothing, a misclick here costs a photograph.
//
// The deletion itself is `deletePinAction`, which re-checks the session and
// re-checks ownership. This component being rendered only for the author is a
// courtesy, not the rule.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { deletePinAction } from "@/app/actions/pins";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function DeletePinButton({
  pinId,
  pinTitle,
  /** Whether the image file itself goes too — an uploaded pin owns its asset. */
  removesFile = false,
  /** Where to land afterwards. The pin's own page won't exist any more. */
  redirectTo = "/dashboard/pins",
  className,
}: {
  pinId: string;
  pinTitle: string;
  removesFile?: boolean;
  redirectTo?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    setError(null);

    startTransition(async () => {
      const result = await deletePinAction(pinId);

      if (result.error) {
        setError(result.error);
        return;
      }

      // Leave BEFORE closing: this page is about a pin that no longer exists,
      // and the action has already marked the destination stale, so the list we
      // land on is rebuilt without the row rather than served from the cache
      // with it still in place.
      router.replace(redirectTo);
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border border-red-200 px-4 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/50",
          className,
        )}
      >
        <Trash2 className="size-4" />
        Delete
      </DialogTrigger>

      <DialogPortal>
        <DialogBackdrop />

        <DialogPopup className="gap-5">
          <div className="flex flex-col gap-1">
            <DialogTitle>Delete this photo?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{pinTitle}</span> will be
              removed for good, along with its comments and anyone&rsquo;s saves of it.
              {removesFile
                ? " The uploaded file is deleted from storage too."
                : " The image itself lives on another site, so only the pin goes."}{" "}
              This can&rsquo;t be undone.
            </DialogDescription>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {/* A plain button rather than <DialogClose>, so it can be disabled
                while the delete is in flight — closing the dialog mid-request
                would hide the outcome of something already happening. */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="h-10 cursor-pointer rounded-full border border-border px-4 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
