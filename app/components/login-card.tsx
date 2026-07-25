// The login card's contents, shared by two surfaces:
//   - <LoginDialog>  — the modal that opens over the live photo wall
//   - /login         — the standalone route (Auth.js's `pages.signIn` target,
//                      and the no-JavaScript fallback)
//
// It has no hooks of its own, so it works as a Server Component on /login and
// gets compiled into the client bundle when the dialog imports it.
//
// `title` / `description` are slots because the dialog must render Base UI's
// <DialogTitle> / <DialogDescription> (for the aria wiring) while the page just
// renders plain headings.

import Image from "next/image";

import { signInWithGoogle } from "@/app/actions/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import googleIcon from "@/public/google.svg";

type LoginCardProps = {
  /** Where to land after a successful sign-in. */
  redirectTo?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

export default function LoginCard({
  redirectTo = "/dashboard",
  title,
  description,
}: LoginCardProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="PixSift" className="h-14 w-auto" />
        {title}
        {description}
      </div>

      {/* A plain <form> whose action is a Server Function. This is why the
          dialog needs no client-side auth code at all — and why it still works
          before hydration. */}
      <form action={signInWithGoogle} className="flex flex-col gap-3">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <button
          type="submit"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 w-full gap-2.5 rounded-full font-mono text-sm",
          )}
        >
          <Image src={googleIcon} width={18} height={18} alt="" />
          Continue with Google
        </button>
      </form>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        You can browse PixSift without an account. Signing in lets you add photos
        and keep favourites.
      </p>
    </div>
  );
}
