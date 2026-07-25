"use server";

// Auth Server Actions in their OWN file with a top-level "use server", because
// Client Components can't define server functions — they can only import them
// from a file marked like this (see the Next docs on mutating data).
//
// This is what lets the login DIALOG work: a client component renders the form,
// but the Google OAuth redirect is still kicked off on the server.

import { signIn, signOut } from "@/auth";

export async function signInWithGoogle(formData: FormData) {
  // Where to land after a successful login. Passed as a hidden input so the
  // same action serves the header dialog, the /login page, and inline prompts.
  const raw = formData.get("redirectTo");
  const redirectTo = typeof raw === "string" && raw.startsWith("/") ? raw : "/dashboard";

  await signIn("google", { redirectTo });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
