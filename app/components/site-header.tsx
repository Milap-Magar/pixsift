// Shared top bar. It's an async Server Component, so it can read the session
// directly with `auth()` and show different UI for logged-in vs logged-out
// users — no client-side JavaScript required.
//
// The two entry points into "logged-in only" territory are dialogs, not routes:
// signing in opens <LoginDialog> and adding a photo opens <AddPinDialog>, so the
// user never loses the grid they were looking at.

import Link from "next/link";
import Image from "next/image";
import { LayoutGrid, Plus } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import googlesvg from "@/public/google.svg";

import AddPinDialog from "./add-pin-dialog";
import LoginDialog from "./login-dialog";
import UserAvatar from "./user-avatar";

const navLinks = [
  { id: 1, name: "Discover", link: "/discover" },
  { id: 2, name: "Most Popular", link: "/most-popular" },
  // Searches Pixabay, not the site — that's where new images come from.
  { id: 3, name: "Find photos", link: "/search" },
];

export default async function SiteHeader() {
  const user = await currentUser();
  // Read on the server and passed down — the client must never see the config.
  const uploadEnabled = isCloudinaryConfigured();

  return (
    // z-40 leaves deliberate headroom: above all page content, still below the
    // dialogs (z-50) that must cover the header when open.
    <header className="sticky top-0 z-40 bg-transparent backdrop-blur dark:border-white/10 dark:bg-black/70">
      {/* Same max-w-page wrapper as every <main>, so the logo lines up with the
          grid below it on ultrawide screens instead of drifting to the edge. */}
      <div className="mx-auto flex w-full max-w-page items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 xl:gap-24">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="PixSift" className="h-16 w-auto rounded-md" />
        </Link>
        {/* Navlink lists */}
        <ul className="flex">
          {navLinks.map((navlink) => (
            <li key={navlink.id} className="flex items-baseline">
              <Link href={navlink.link} className="pt-2">
                <Button
                  variant={"link"}
                  className={"text-md cursor-pointer font-mono"}
                  animation={"underlineCenter"}
                >
                  {navlink.name}
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <nav className="flex items-center gap-3">
        {user ? (
          <>
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "h-10 gap-2 rounded-full px-4 font-mono",
              )}
            >
              <LayoutGrid className="size-4" />
              Dashboard
            </Link>

            <AddPinDialog
              uploadEnabled={uploadEnabled}
              className={cn(
                buttonVariants({ variant: "default" }),
                "h-10 gap-1.5 rounded-full bg-red-600 px-4 font-mono text-white hover:bg-red-700",
              )}
            >
              <Plus className="size-4" />
              Add pin
            </AddPinDialog>

            {/* Always renders something — see UserAvatar for why that matters. */}
            <Link
              href="/profile"
              title={`${user.name} — your profile`}
              className="flex items-center rounded-full transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <UserAvatar name={user.name} image={user.image} size={32} />
              <span className="sr-only">Your profile</span>
            </Link>

            <form action={signOutAction}>
              <button className="cursor-pointer text-sm text-zinc-500 hover:underline">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <LoginDialog
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-10 gap-2 rounded-full px-4 font-mono",
            )}
            redirectTo="/dashboard"
          >
            <Image src={googlesvg} width={20} height={20} alt="" />
            Sign up with google
          </LoginDialog>
        )}
        </nav>
      </div>
    </header>
  );
}
