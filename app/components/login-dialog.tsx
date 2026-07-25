"use client";

// Login as a MODAL instead of a page navigation.
//
// The backdrop is the interesting part: rather than a flat grey sheet, it holds
// the live <PhotoWall /> with a dark scrim on top, so you get dimmed Pinterest
// style photos drifting behind the card while you sign in.
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
import PhotoWall from "./photo-wall";

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
        {/* The wrapper's own background is transparent — the photo wall and the
            scrim below provide the whole look. */}
        <DialogBackdrop className="overflow-hidden bg-transparent backdrop-blur-none">
          <PhotoWall className="scale-105 opacity-50 blur-[3px] saturate-125" />
          {/* The scrim. This is what knocks the background opacity down so the
              card in front stays perfectly readable. */}
          <div className="absolute inset-0 bg-black/70" />
        </DialogBackdrop>

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
              <DialogDescription>Sign in to start pinning what you love.</DialogDescription>
            }
          />
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
