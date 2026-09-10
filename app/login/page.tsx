// THE SIGN-IN PAGE ("/login").
//
// Signing in is normally a dialog from the header, so this route is the fallback
// for three cases — and each one shapes the design:
//   · Auth.js redirects here itself (`pages.signIn` in auth.ts), sometimes with
//     an `?error=` it expects us to explain
//   · someone opens the URL directly, or has it bookmarked
//   · JavaScript hasn't loaded, so no dialog can open
//
// That last one is why the form is a plain <form> posting to a Server Function
// and not an onClick handler. This page works before hydration.
//
// ── The layout ───────────────────────────────────────────────────────────
// A split: photographs on the left, the form on the right. The old version put
// a card over a full-bleed animated background, which meant the one thing the
// visitor came to do was competing with twenty moving images for attention. A
// split gives the form a calm, opaque column of its own and still lets the
// photographs do the selling — on a screen wide enough to have room for both.
// Below `lg` the panel is dropped entirely rather than stacked, because a
// sign-in form should be the first thing on a phone, not the second.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Copy, Palette, ShieldCheck } from "lucide-react";

import LoginCard from "@/app/components/login-card";
import { listPins } from "@/lib/db/pins";
import { currentUser } from "@/lib/session";

import LoginShowcase from "./login-showcase";

export const metadata = {
  title: "Sign in · PixSift",
  description: "Sign in to PixSift with Google to save, post and organise photos.",
};

/**
 * What Auth.js's error codes actually mean, in words a visitor can act on.
 *
 * Without this the page renders `?error=OAuthAccountNotLinked` and nothing else,
 * which tells the user nothing and tells us nothing either. The default branch
 * is deliberately vague about causes and specific about the next step, because
 * the remaining codes are mostly server-side misconfiguration that the person
 * reading cannot do anything about.
 */
const ERROR_MESSAGES: Record<string, string> = {
  Configuration:
    "Sign-in isn't configured correctly on our side. This one's on us — try again shortly.",
  AccessDenied: "You cancelled the sign-in, or Google declined the request. Nothing was changed.",
  Verification: "That sign-in link has expired or was already used. Start again below.",
  OAuthAccountNotLinked:
    "That email is already registered through a different sign-in method.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Already signed in? Nothing to do here.
  const user = await currentUser();
  if (user) redirect("/dashboard");

  const { error, callbackUrl } = await searchParams;

  // Only ever a same-origin PATH. An absolute URL here would make this page an
  // open redirector: `/login?callbackUrl=https://evil.example` would send
  // someone straight off our domain immediately after authenticating, which is
  // the classic phishing setup. Requiring a leading "/" and rejecting "//"
  // (protocol-relative, which browsers treat as absolute) keeps it internal.
  const destination =
    typeof callbackUrl === "string" &&
    callbackUrl.startsWith("/") &&
    !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/dashboard";

  const errorMessage =
    typeof error === "string"
      ? (ERROR_MESSAGES[error] ?? "That sign-in didn't go through. Try once more below.")
      : null;

  // Public pins only — no viewer to scope to, and a signed-out visitor must
  // never see anyone's private photographs on the way in.
  const { pins } = await listPins({ limit: 9 });

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* ── The photographs ────────────────────────────────────────────── */}
      <section className="relative hidden overflow-hidden bg-black lg:block">
        <LoginShowcase pins={pins} />

        <div className="relative z-10 flex h-full flex-col justify-end gap-6 p-12 text-white">
          <div>
            <h2 className="font-heading text-4xl leading-tight">
              Every photo, understood.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
              PixSift reads each image the moment it arrives — the colours it&rsquo;s made
              of, and a fingerprint of what it looks like. That&rsquo;s what makes finding
              things here different.
            </p>
          </div>

          <ul className="flex flex-col gap-3 text-sm">
            <Feature icon={<Palette className="size-4" />}>
              Search by colour, not just by words
            </Feature>
            <Feature icon={<Copy className="size-4" />}>
              Duplicates spotted before you post them twice
            </Feature>
            <Feature icon={<ShieldCheck className="size-4" />}>
              Your photos stay private until you say otherwise
            </Feature>
          </ul>
        </div>
      </section>

      {/* ── The form ───────────────────────────────────────────────────── */}
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <LoginCard
            redirectTo={destination}
            error={errorMessage}
            title={
              <h1 className="font-heading text-3xl leading-tight">Welcome to PixSift</h1>
            }
            description={
              <p className="text-sm text-muted-foreground">
                Sign in to save what you love, post your own, and download anything.
              </p>
            }
          />

          <p className="mt-10 text-center text-xs text-muted-foreground">
            <Link href="/" className="underline underline-offset-2 hover:text-foreground">
              Keep browsing without an account
            </Link>{" "}
            — everything public is readable signed out.
          </p>
        </div>
      </section>
    </main>
  );
}

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur">
        {icon}
      </span>
      <span className="text-white/85">{children}</span>
    </li>
  );
}
