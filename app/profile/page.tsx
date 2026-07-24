// A PROTECTED PAGE. It reads the session on the server with `auth()` and, if
// there's no logged-in user, redirects to /login. This is the recommended way
// to protect a route in Next 16 (the docs advise doing auth checks close to the
// data / page, NOT only in proxy/middleware).

import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await auth();

  // Not logged in → bounce to the login page.
  if (!session?.user) redirect("/login");

  const { name, email, image } = session.user;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">You are signed in ✅</h1>

      {/* Google gives us the profile photo URL in session.user.image */}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" width={72} height={72} className="rounded-full" />
      )}

      <p className="text-lg">{name}</p>
      <p className="text-zinc-500">{email}</p>

      {/* Sign out is also a server action. */}
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="rounded-full border border-black/15 px-5 py-2 transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
