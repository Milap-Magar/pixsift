// ── Auth.js v5 (next-auth@5) central config ────────────────────────────────
// This ONE file is the heart of authentication. Everything else imports from it.
//
// `NextAuth(config)` returns four things:
//   - handlers : the GET/POST functions your API route re-exports (the OAuth
//                endpoints Google talks to).
//   - signIn   : call this (from a Server Action) to start a login.
//   - signOut  : call this to log the user out.
//   - auth     : call this in Server Components / Route Handlers to read the
//                current session (or `null` if logged out).
//
// Why a separate file (not inside the route)? Because `auth` is needed all over
// the app — pages, layouts, API routes — so it lives in one importable place.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Providers = the ways a user can log in. Add more here later (GitHub, email…).
  providers: [
    Google({
      // Auth.js auto-reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from the env,
      // but we pass them explicitly so it's obvious where they come from.
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],

  // Optional: send users to our own /login page instead of the default one.
  pages: {
    signIn: "/login",
  },
});
