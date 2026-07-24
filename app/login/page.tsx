// A LOGIN PAGE. This is a Server Component (no "use client" at the top), so it
// can safely call server-only auth functions.
//
// The button lives inside a <form> whose `action` is an inline Server Action
// (note the "use server" directive). When submitted, it runs ON THE SERVER and
// kicks off the Google OAuth redirect. This is the Auth.js v5 pattern — no
// client-side JavaScript needed to start a login.

import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  // If already signed in, don't show the login form — go to the profile.
  const session = await auth();
  if (session?.user) redirect("/profile");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in to PixSift</h1>

      <form
        action={async () => {
          "use server";
          // "google" matches the provider id in auth.ts.
          // redirectTo = where the user lands after a successful login.
          await signIn("google", { redirectTo: "/profile" });
        }}
      >
        <button
          type="submit"
          className="rounded-full border border-black/10 bg-black px-6 py-3 text-white transition hover:opacity-90 dark:bg-white dark:text-black"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
