"use client";

// The save (heart) control, shared by the grid cards and the details page.
//
// The two logged-out / logged-in paths are deliberately different elements, not
// a disabled button:
//   - signed out → the heart IS a <LoginDialog> trigger, so clicking it opens
//     the login modal instead of doing nothing.
//   - signed in  → it calls the toggleFavoriteAction Server Function, with
//     useOptimistic so it fills in instantly and then reconciles with whatever
//     the server says.

import { useOptimistic, useTransition } from "react";
import { Heart } from "lucide-react";

import { toggleFavoriteAction } from "@/app/actions/pins";
import { cn } from "@/lib/utils";

import LoginDialog from "./login-dialog";

type FavoriteToggleProps = {
  pinId: string;
  pinTitle: string;
  /** Whether the current user has saved this pin. Always false when signed out. */
  favorited: boolean;
  signedIn: boolean;
  /** Where to return after signing in from this control. */
  returnTo?: string;
  className?: string;
  /** Show "Save" / "Saved" next to the heart. Off for the grid overlay. */
  showLabel?: boolean;
};

export default function FavoriteToggle({
  pinId,
  pinTitle,
  favorited,
  signedIn,
  returnTo = "/dashboard",
  className,
  showLabel = true,
}: FavoriteToggleProps) {
  if (!signedIn) {
    return (
      <LoginDialog className={className} redirectTo={returnTo}>
        <Heart className="size-4" />
        {showLabel && "Save"}
        <span className="sr-only">Sign in to save “{pinTitle}”</span>
      </LoginDialog>
    );
  }

  return (
    <SignedInToggle
      pinId={pinId}
      pinTitle={pinTitle}
      favorited={favorited}
      className={className}
      showLabel={showLabel}
    />
  );
}

function SignedInToggle({
  pinId,
  pinTitle,
  favorited,
  className,
  showLabel,
}: {
  pinId: string;
  pinTitle: string;
  favorited: boolean;
  className?: string;
  showLabel: boolean;
}) {
  // `favorited` is the server truth; optimisticFavorited is what we paint while
  // the action is in flight. When revalidation lands, the two converge.
  const [optimisticFavorited, setOptimisticFavorited] = useOptimistic(favorited);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setOptimisticFavorited(!favorited);
      await toggleFavoriteAction(pinId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={optimisticFavorited}
      className={cn(className, "disabled:opacity-70")}
    >
      <Heart
        className={cn(
          "size-4 transition",
          optimisticFavorited && "scale-110 fill-red-600 text-red-600",
        )}
      />
      {showLabel && (optimisticFavorited ? "Saved" : "Save")}
      <span className="sr-only">
        {optimisticFavorited ? `Remove “${pinTitle}” from favourites` : `Save “${pinTitle}”`}
      </span>
    </button>
  );
}
