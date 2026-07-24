// Shared top bar. It's an async Server Component, so it can read the session
// directly with `auth()` and show different UI for logged-in vs logged-out
// users — no client-side JavaScript required.

import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-white/80 px-6 py-3 backdrop-blur dark:border-white/10 dark:bg-black/70">
      <Link href="/" className="flex items-center">
        {/* The wordmark logo from public/logo.svg */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="PixSift" className="h-16 w-auto rounded-md" />
      </Link>

      <nav className="flex items-center gap-3">
        {user ? (
          <>
            <Link
              href="/add"
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              + Add pin
            </Link>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {user.image && (
              <img src={user.image} alt="" width={32} height={32} className="rounded-full" />
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="text-sm text-zinc-500 hover:underline">Sign out</button>
            </form>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-mono text-white transition hover:bg-red-700"
          >
            Log in with google
          </Link>
        )}
      </nav>
    </header>
  );
}
