import { auth } from "@/auth";

/**
 * The shape the app actually cares about. `id` is the stable key we store pins
 * and favourites against — Google always gives us an email, so we use that and
 * fall back to the provider id.
 */
export type CurrentUser = {
  id: string;
  name: string;
  image?: string | null;
};

/** `null` when nobody is signed in. Safe to call from any Server Component. */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  const id = user.email ?? user.id;
  if (!id) return null;

  return {
    id,
    name: user.name ?? user.email ?? "Unknown",
    image: user.image,
  };
}
