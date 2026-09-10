"use client";

// Login as a MODAL instead of a page navigation.
//
// The point of the dialog is that you DON'T lose the grid you were looking at —
// so the backdrop's job is to dim that grid, not to replace it.
//
// It used to render a second wall of twenty picsum.photos images behind the
// scrim. Twenty network requests, fired on open, to hide the page's own
// photographs behind a stranger's — and docs/ROADMAP.md rightly called it the
// heaviest thing on the page. A blur and a scrim over what is already there
// costs nothing and shows the user their own context.
//
// Use it by wrapping whatever should open it:
//   <LoginDialog className="...">Sign in</LoginDialog>
// The children become the trigger.

import { X } from "lucide-react";

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

import LoginCard from "./login-card";

type LoginDialogProps = {
  /** Rendered inside the trigger button. */
  children: React.ReactNode;
  /** Classes for the trigger button. */
  className?: string;
  /** Where to land after a successful sign-in. */
  redirectTo?: string;
};

export default function LoginDialog({
  children,
  className,
  redirectTo = "/dashboard",
}: LoginDialogProps) {
  return (
    <Dialog>
      <DialogTrigger className={className}>{children}</DialogTrigger>

      <DialogPortal>
        {/* Dims and blurs the page behind it, so the card stays readable while
            the grid you came from is still recognisably there. */}
        <DialogBackdrop className="bg-black/60 backdrop-blur-sm" />

        <DialogPopup className="w-100 gap-0 rounded-3xl border-white/15 bg-background/95 p-8 shadow-black/40 backdrop-blur-xl">
          {/* Base UI asks for Close to live inside Popup on modal dialogs, so
              touch screen readers have a way out. */}
          <DialogClose
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </DialogClose>

          <LoginCard
            redirectTo={redirectTo}
            title={<DialogTitle className="text-2xl">Welcome to PixSift</DialogTitle>}
            description={
              <DialogDescription>
                Sign in to save, post and download.
              </DialogDescription>
            }
          />
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
