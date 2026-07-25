// The /login ROUTE still exists even though signing in is normally a dialog now.
// It's the fallback for three cases:
//   - Auth.js redirects here itself (`pages.signIn` in auth.ts)
//   - someone opens the URL directly or has it bookmarked
//   - JavaScript hasn't loaded, so no dialog can open
//
// It renders the same card over the same live photo wall as <LoginDialog>, so
// both paths look identical.

import { redirect } from "next/navigation";

import LoginCard from "@/app/components/login-card";
import PhotoWall from "@/app/components/photo-wall";
import { currentUser } from "@/lib/session";

export default async function LoginPage() {
  // Already signed in? Nothing to do here.
  const user = await currentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      <PhotoWall className="scale-105 opacity-50 blur-[3px] saturate-125" />
      {/* The scrim that dims the photos down behind the card. */}
      <div className="pointer-events-none absolute inset-0 bg-black/70" />

      <div className="relative z-10 w-100 max-w-[calc(100vw-2rem)] rounded-3xl border border-white/15 bg-background/95 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <LoginCard
          redirectTo="/dashboard"
          title={<h1 className="text-2xl leading-tight font-semibold">Welcome to PixSift</h1>}
          description={
            <p className="text-sm text-muted-foreground">
              Sign in to start pinning what you love.
            </p>
          }
        />
      </div>
    </main>
  );
}
