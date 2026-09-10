// The login card's contents, shared by two surfaces:
//   - <LoginDialog>  — the modal that opens over the current page
//   - /login         — the standalone route (Auth.js's `pages.signIn` target,
//                      and the no-JavaScript fallback)
//
// It has no hooks of its own, so it works as a Server Component on /login and
// gets compiled into the client bundle when the dialog imports it.
//
// `title` / `description` are slots because the dialog must render Base UI's
// <DialogTitle> / <DialogDescription> (for the aria wiring) while the page just
// renders plain headings.
//
// ── Google only, and why that's the whole design ─────────────────────────
// One provider means there is exactly one decision on this screen, so the
// screen should look like it. No email field, no password, no "or continue
// with" divider separating one option from nothing. What the space buys
// instead is a button large enough to be the obvious target, and an honest
// line about what signing in actually does.

import Image from "next/image";
import { AlertCircle } from "lucide-react";

import { signInWithGoogle } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import googleIcon from "@/public/google.svg";

type LoginCardProps = {
  /** Where to land after a successful sign-in. Validated by the caller. */
  redirectTo?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** A human-readable sign-in failure, already translated from Auth.js's code. */
  error?: string | null;
  className?: string;
};

export default function LoginCard({
  redirectTo = "/dashboard",
  title,
  description,
  error,
  className,
}: LoginCardProps) {
  return (
    <div className={cn("flex flex-col gap-7", className)}>
      <div className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="PixSift" className="h-16 w-auto" />
        {title}
        {description}
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {/* A plain <form> whose action is a Server Function. This is why the
          dialog needs no client-side auth code at all — and why it still works
          before hydration. */}
      <form action={signInWithGoogle} className="flex flex-col gap-3">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        {/* Deliberately not `buttonVariants({ variant: "outline" })`. This is
            the only action on the page, and Google's brand guidance asks for a
            white button with their mark at a legible size — so it's styled
            here rather than bent out of a shared variant. */}
        <button
          type="submit"
          className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-border bg-background text-sm font-medium shadow-sm transition hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:translate-y-px"
        >
          <Image src={googleIcon} width={20} height={20} alt="" />
          Continue with Google
        </button>
      </form>

      <div className="flex flex-col gap-2 text-center text-xs leading-relaxed text-muted-foreground">
        <p>
          We only ever read your name, email and profile picture — enough to put your
          photos under your name and keep your favourites yours.
        </p>
      </div>
    </div>
  );
}
